import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'

interface WaveformPlayerProps {
  /** Audio source. Pass either a Blob (from synthesize/transcribe) or a URL. */
  blob?: Blob
  url?: string
  /** Optional label shown above the waveform (e.g. "kokoro / af_heart"). */
  label?: string
  /** Auto-play when the source changes. Default true. */
  autoplay?: boolean
}

const WAVE_COLOR = '#8b92a8'
const PROGRESS_COLOR = '#5b8af5'
const CURSOR_COLOR = '#e8eaf0'

function fmt(s: number) {
  if (!isFinite(s) || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

/**
 * Waveform-aware audio player backed by wavesurfer.js, decoded through an
 * HTMLAudioElement (the `media` config). Using `media` instead of `url`
 * delegates audio decoding to the browser's native audio pipeline — more
 * forgiving than wavesurfer's WebAudio decodeAudioData() path, which can
 * silently fail on streamed/headerless MP3s like those produced by
 * kokoro-fastapi without ID3 headers.
 */
export function WaveformPlayer({ blob, url, label, autoplay = true }: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const blobUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob])
  const finalUrl = blobUrl ?? url

  // Mount: spin up an <audio> element + wavesurfer instance hooked to it.
  useEffect(() => {
    if (!containerRef.current || !finalUrl) return undefined

    setReady(false)
    setError(null)
    setDuration(0)
    setCurrentTime(0)

    // Detached audio element — wavesurfer's `media` config drives decoding via
    // the native browser pipeline (works for streamed MP3 / WAV / Opus).
    const audio = new Audio()
    audio.preload = 'auto'
    audio.src = finalUrl
    audioRef.current = audio

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: WAVE_COLOR,
      progressColor: PROGRESS_COLOR,
      cursorColor: CURSOR_COLOR,
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 64,
      normalize: true,
      media: audio,
    })
    wavesurferRef.current = ws

    const onReady = () => {
      setReady(true)
      setDuration(audio.duration || ws.getDuration() || 0)
      if (autoplay) {
        // Browsers often gate autoplay on user gesture — swallow the rejection
        // so it doesn't surface as a console error; the user can hit Play.
        void audio.play().catch(() => {})
      }
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => setPlaying(false)
    const onTime = () => setCurrentTime(audio.currentTime)
    const onLoaded = () => setDuration(audio.duration || 0)
    const onAudioError = () => {
      setError('Browser could not decode this audio. Try downloading the file instead.')
    }
    const onWsError = (msg: unknown) => {
      // wavesurfer rendering errors don't block playback (audio still works
      // via the element) — log but don't surface unless user-facing.
      console.warn('[WaveformPlayer] wavesurfer error:', msg)
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('error', onAudioError)
    ws.on('ready', onReady)
    ws.on('error', onWsError)

    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('error', onAudioError)
      try {
        audio.pause()
        audio.src = ''
      } catch {}
      try {
        ws.unAll()
        ws.destroy()
      } catch {}
      audioRef.current = null
      wavesurferRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalUrl])

  // Revoke blob URL on cleanup (separate so it runs after the element is detached)
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [blobUrl])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      void audio.play().catch((err) => setError(`Play failed: ${err.message}`))
    } else {
      audio.pause()
    }
  }, [])

  return (
    <div className="flex flex-col gap-2 p-4 bg-stone-900 rounded-lg border border-stone-800">
      {label && <div className="text-xs text-text-dim font-mono">{label}</div>}
      <div ref={containerRef} className="w-full" aria-label="Audio waveform" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!ready && !error}
          className="px-3 py-1 rounded bg-accent text-white text-xs font-medium hover:bg-accent-dim disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <span className="text-xs text-text-muted font-mono tabular-nums">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
        {blobUrl && (
          <a
            href={blobUrl}
            download="preview.mp3"
            className="ml-auto text-xs text-text-dim hover:text-text underline"
          >
            Download
          </a>
        )}
      </div>
      {error && (
        <div role="alert" className="text-xs text-danger bg-red-950/40 border border-red-900/60 rounded px-2 py-1">
          {error}
        </div>
      )}
    </div>
  )
}
