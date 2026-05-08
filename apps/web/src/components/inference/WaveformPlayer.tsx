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
 * Waveform-aware audio player backed by wavesurfer.js. Replaces the basic
 * progress-bar AudioPlayer with a visual waveform that shows the audio
 * envelope and supports click-to-seek anywhere in the track.
 *
 * Useful for TTS preview (showing sentence cadence at a glance), STT QC
 * (selecting regions to retranscribe), and music-clip auditioning.
 */
export function WaveformPlayer({ blob, url, label, autoplay = true }: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [ready, setReady] = useState(false)

  const blobUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob])
  const finalUrl = blobUrl ?? url

  useEffect(() => {
    if (!containerRef.current || !finalUrl) return undefined
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
      url: finalUrl,
    })
    wavesurferRef.current = ws

    const onReady = () => {
      setReady(true)
      setDuration(ws.getDuration())
      if (autoplay) void ws.play().catch(() => {})
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onFinish = () => setPlaying(false)
    const onTime = (t: number) => setCurrentTime(t)

    ws.on('ready', onReady)
    ws.on('play', onPlay)
    ws.on('pause', onPause)
    ws.on('finish', onFinish)
    ws.on('timeupdate', onTime)

    return () => {
      ws.unAll()
      ws.destroy()
      wavesurferRef.current = null
      setReady(false)
      setPlaying(false)
      setCurrentTime(0)
      setDuration(0)
    }
  }, [finalUrl, autoplay])

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [blobUrl])

  const togglePlay = useCallback(() => {
    if (!wavesurferRef.current) return
    void wavesurferRef.current.playPause()
  }, [])

  return (
    <div className="flex flex-col gap-2 p-4 bg-stone-900 rounded-lg border border-stone-800">
      {label && <div className="text-xs text-text-dim font-mono">{label}</div>}
      <div ref={containerRef} className="w-full" aria-label="Audio waveform" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!ready}
          className="px-3 py-1 rounded bg-accent text-white text-xs font-medium hover:bg-accent-dim disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <span className="text-xs text-text-muted font-mono tabular-nums">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
      </div>
    </div>
  )
}
