import { useCallback, useEffect, useRef, useState } from 'react'
import { useSttClient } from '@/api/clients'

const RECORD_LIMIT_SEC = 120

/**
 * Reusable mic-record-and-transcribe lifecycle hook. Extracted from
 * DictationButton so non-button surfaces (Phase G global hotkey,
 * future per-chapter dictation) can share the recording machinery
 * without instantiating an off-screen button.
 *
 *   const { start, stop, state, elapsed } = useDictation({
 *     onTranscribe: (text, meta) => …,
 *     onError: (err) => …,
 *     language: 'auto',
 *   })
 *
 * `state` cycles 'idle' → 'recording' → 'transcribing' → 'idle'. Calling
 * start() while already recording is a no-op; stop() while transcribing
 * is a no-op (transcription is already in flight). Auto-stops at
 * RECORD_LIMIT_SEC to avoid runaway recordings.
 *
 * The hook owns all DOM/MediaRecorder lifecycle and cleans up on unmount.
 */
export function useDictation({ onTranscribe, onError, language = 'auto' } = {}) {
  const stt = useSttClient()
  const [state, setState] = useState('idle')
  const [elapsed, setElapsed] = useState(0)

  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const startTsRef = useRef(0)
  const tickRef = useRef(null)
  const autoStopRef = useRef(null)
  const stoppingRef = useRef(false)

  const cleanup = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    if (autoStopRef.current) clearTimeout(autoStopRef.current)
    tickRef.current = null
    autoStopRef.current = null
    if (recorderRef.current) {
      try {
        recorderRef.current.stream.getTracks().forEach(t => t.stop())
      } catch {}
      recorderRef.current = null
    }
    chunksRef.current = []
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const stop = useCallback(() => {
    if (recorderRef.current && !stoppingRef.current) {
      stoppingRef.current = true
      try { recorderRef.current.stop() } catch {}
    }
  }, [])

  const start = useCallback(async () => {
    if (state !== 'idle') return
    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.(new Error('Microphone not available in this browser'))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      stoppingRef.current = false
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        cleanup()
        if (blob.size === 0) {
          setState('idle')
          return
        }
        setState('transcribing')
        try {
          const result = await stt.transcribe(blob, { language })
          onTranscribe?.(result.text ?? '', { language: result.language, duration: result.duration })
        } catch (err) {
          onError?.(err)
        } finally {
          setState('idle')
        }
      }
      recorder.start()
      recorderRef.current = recorder
      startTsRef.current = Date.now()
      setElapsed(0)
      setState('recording')
      tickRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTsRef.current) / 1000))
      }, 250)
      autoStopRef.current = setTimeout(() => stop(), RECORD_LIMIT_SEC * 1000)
    } catch (err) {
      onError?.(err)
      setState('idle')
    }
  }, [state, language, stt, onTranscribe, onError, cleanup, stop])

  return {
    start,
    stop,
    state,
    elapsed,
    isIdle:         state === 'idle',
    isRecording:    state === 'recording',
    isTranscribing: state === 'transcribing',
  }
}
