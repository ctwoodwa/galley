import { useRef, useEffect, useState } from 'react'
import type { Track } from '@galley/api-client'
import { Waveform } from './Waveform'
import { IconPlay, IconPause, IconSkip, IconBack, IconVolume, IconStar, IconStarOut, IconQueue } from './icons'

function fmtTime(s: number) {
  if (!s && s !== 0) return '0:00'
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

interface Props {
  track: Track | null
  isPlaying: boolean
  volume: number
  queueLen: number
  showQueue: boolean
  audioRef: React.RefObject<HTMLAudioElement | null>
  onToggle: () => void
  onPrev: () => void
  onNext: () => void
  onSeek: (p: number) => void
  onVolume: (v: number) => void
  onFav: (id: string) => void
  onToggleQueue: () => void
}

export function MusicPlayer({
  track, isPlaying, volume, queueLen, showQueue,
  audioRef, onToggle, onPrev, onNext, onSeek, onVolume, onFav, onToggleQueue,
}: Props) {
  const waveRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [hoverWave, setHoverWave] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTime = () => {
      if (audio.duration) {
        setProgress(audio.currentTime / audio.duration)
        setCurrentTime(audio.currentTime)
      }
    }
    const onMeta = () => setDuration(audio.duration || 0)
    const onEnd = () => { setProgress(0); setCurrentTime(0) }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnd)
    }
  }, [audioRef])

  useEffect(() => {
    setProgress(0)
    setCurrentTime(0)
    setDuration(0)
  }, [track?.id])

  function handleWaveClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!waveRef.current) return
    const rect = waveRef.current.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onSeek(p)
  }

  const artBg = track
    ? `linear-gradient(135deg, ${track.color}, color-mix(in oklab, ${track.color} 30%, #000))`
    : 'var(--mp-bg-3)'

  return (
    <div style={{
      height: 72, flexShrink: 0,
      background: 'var(--mp-bg-1)',
      borderTop: '1px solid var(--mp-line)',
      display: 'grid',
      gridTemplateColumns: '280px 1fr 200px',
      gap: 24, padding: '0 24px',
      alignItems: 'center',
    }}>
      {/* left — track info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
        {/* artwork */}
        <div style={{ width: 44, height: 44, borderRadius: 4, background: artBg, flexShrink: 0, overflow: 'hidden' }}>
          {track && (
            <Waveform seed={track.id} bars={30} height={44} active={progress} />
          )}
        </div>
        {/* track meta */}
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div style={{
            fontSize: 13.5, fontWeight: 500, color: track ? 'var(--mp-fg)' : 'var(--mp-fg-4)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {track?.title ?? 'No track selected'}
          </div>
          {track && (
            <div style={{ fontSize: 11.5, color: 'var(--mp-fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {track.artist || track.source}
            </div>
          )}
        </div>
        {/* fav */}
        {track && (
          <button
            onClick={() => onFav(track.id)}
            style={{ color: track.favorite ? 'var(--mp-accent)' : 'var(--mp-fg-4)', flexShrink: 0 }}
          >
            {track.favorite ? <IconStar width={14} height={14} /> : <IconStarOut width={14} height={14} />}
          </button>
        )}
      </div>

      {/* center — controls + scrubber */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {/* transport */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onPrev} style={{ color: 'var(--mp-fg-3)' }}>
            <IconBack width={18} height={18} />
          </button>
          <button
            onClick={onToggle}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--mp-accent)', color: '#1a1610',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {isPlaying ? <IconPause width={13} height={13} /> : <IconPlay width={13} height={13} />}
          </button>
          <button onClick={onNext} style={{ color: 'var(--mp-fg-3)' }}>
            <IconSkip width={18} height={18} />
          </button>
        </div>

        {/* scrubber */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 480 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mp-fg-3)', flexShrink: 0 }}>
            {fmtTime(currentTime)}
          </span>
          <div
            ref={waveRef}
            onClick={handleWaveClick}
            onMouseEnter={() => setHoverWave(true)}
            onMouseLeave={() => setHoverWave(false)}
            style={{ flex: 1, cursor: track ? 'pointer' : 'default', position: 'relative' }}
          >
            <Waveform seed={track?.id ?? 'empty'} bars={120} height={26} active={progress} />
            {/* thumb */}
            {hoverWave && track && (
              <div style={{
                position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)',
                left: `${progress * 100}%`,
                width: 10, height: 10, borderRadius: '50%',
                background: 'var(--mp-accent)',
                pointerEvents: 'none',
              }} />
            )}
          </div>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mp-fg-3)', flexShrink: 0 }}>
            {fmtTime(duration || track?.duration || 0)}
          </span>
        </div>
      </div>

      {/* right — volume + queue */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
        <IconVolume width={16} height={16} style={{ color: 'var(--mp-fg-3)', flexShrink: 0 }} />
        <input
          type="range" min={0} max={1} step={0.01} value={volume}
          onChange={e => onVolume(Number(e.target.value))}
          style={{
            width: 80, height: 3, cursor: 'pointer', accentColor: 'var(--mp-accent)',
          }}
        />
        <button
          onClick={onToggleQueue}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5,
            color: showQueue ? 'var(--mp-accent)' : 'var(--mp-fg-3)',
            padding: '4px 8px',
            border: `1px solid ${showQueue ? 'var(--mp-accent)' : 'transparent'}`,
            borderRadius: 4,
          }}
        >
          <IconQueue width={14} height={14} />
          {queueLen > 0 && (
            <span style={{
              background: 'var(--mp-accent)', color: '#1a1610',
              borderRadius: 99, padding: '1px 5px', fontSize: 10,
            }}>
              {queueLen}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
