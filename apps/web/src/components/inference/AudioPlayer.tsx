import { useEffect, useRef, useState } from 'react'

interface AudioPlayerProps {
  blob: Blob
  format: string
}

function fmt(s: number) {
  if (!isFinite(s) || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

export function AudioPlayer({ blob, format }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const url = URL.createObjectURL(blob)
    setSrcUrl(url)
    setProgress(0); setCurrentTime(0); setDuration(0)
    if (audioRef.current) {
      audioRef.current.src = url
      void audioRef.current.play().catch(() => {})
    }
    return () => URL.revokeObjectURL(url)
  }, [blob])

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    audioRef.current.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration
  }

  return (
    <div className="animate-fade-up flex flex-col gap-3 p-4 bg-stone-900 rounded-lg border border-stone-800">
      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const a = e.currentTarget
          setCurrentTime(a.currentTime)
          setProgress(a.duration ? a.currentTime / a.duration : 0)
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        aria-label="Generated speech audio"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => playing ? audioRef.current?.pause() : void audioRef.current?.play()}
          aria-label={playing ? 'Pause' : 'Play'}
          className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 flex items-center justify-center text-stone-950 transition-colors flex-shrink-0 shadow-sm"
        >
          {playing ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
              <rect x="1" y="0" width="3" height="10" rx="1" />
              <rect x="6" y="0" width="3" height="10" rx="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
              <path d="M1 0L10 5L1 10V0Z" />
            </svg>
          )}
        </button>

        <div
          onClick={seek}
          className="flex-1 h-1.5 bg-stone-700 rounded-full cursor-pointer relative overflow-hidden group"
          role="slider"
          aria-label="Playback position"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="absolute left-0 top-0 h-full bg-amber-400 rounded-full transition-[width] duration-75"
            style={{ width: `${progress * 100}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-amber-300 shadow opacity-0 group-hover:opacity-100 transition-opacity -ml-1.5"
            style={{ left: `${progress * 100}%` }}
          />
        </div>

        <span className="font-mono text-xs text-stone-500 tabular-nums w-[70px] text-right flex-shrink-0">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
      </div>

      {srcUrl && (
        <a
          href={srcUrl}
          download={`output.${format}`}
          className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors self-start"
        >
          ↓ Download {format.toUpperCase()}
        </a>
      )}
    </div>
  )
}
