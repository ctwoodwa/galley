import { useCallback, useEffect, useRef, useState } from 'react'
import { useSttClient } from '@/api/clients'

const RECORD_LIMIT_SEC = 120

/**
 * Reusable mic-record-and-transcribe button.
 *
 *   <DictationButton onTranscribe={(text) => setNoteText(prev => prev + text)} />
 *
 * Click to start recording (browser asks for mic permission once); click
 * again to stop and transcribe via the Windows STT API. The transcribed
 * text is appended via `onTranscribe`. Errors surface as `onError`
 * callbacks; if not supplied, errors fall through to console.
 *
 * Visuals: small button with mic icon. Recording state shows a pulsing
 * dot + elapsed seconds. Transcribing shows a spinner. Auto-stops at
 * RECORD_LIMIT_SEC to avoid runaway recordings.
 *
 * Designed to drop into any text-input UI (CommentToolbar today; future
 * chapter-editing surfaces). The button is 24×24px so it fits inline
 * next to a textarea without disrupting layout.
 */
export function DictationButton({ onTranscribe, onError, language = 'auto', className = '', title = 'Dictate (mic)' }) {
  const stt = useSttClient()
  const [state, setState] = useState('idle') // 'idle' | 'recording' | 'transcribing'
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const startTsRef = useRef(0)
  const tickRef = useRef(null)
  const autoStopRef = useRef(null)

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
          onTranscribe(result.text ?? '', { language: result.language, duration: result.duration })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, language, stt, onTranscribe, onError, cleanup])

  const stop = useCallback(() => {
    if (recorderRef.current && state === 'recording') {
      try {
        recorderRef.current.stop()
      } catch {}
    }
  }, [state])

  const handleClick = state === 'recording' ? stop : start

  if (state === 'transcribing') {
    return (
      <button
        type="button"
        className={className}
        disabled
        title="Transcribing…"
        style={{ cursor: 'wait' }}
      >
        <span className="dictation-spinner" aria-label="Transcribing">⟳</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      title={state === 'recording' ? `Recording ${elapsed}s — click to stop` : title}
      aria-pressed={state === 'recording'}
      style={{
        background: state === 'recording' ? 'rgba(240, 82, 82, 0.18)' : 'transparent',
        border: '1px solid var(--sidebar-border)',
        color: state === 'recording' ? '#f05252' : 'var(--text-dim)',
        borderRadius: 'var(--radius)',
        padding: '4px 8px',
        fontSize: 12,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <span aria-hidden="true">{state === 'recording' ? '●' : '🎙'}</span>
      <span>{state === 'recording' ? `${elapsed}s` : 'Dictate'}</span>
    </button>
  )
}
