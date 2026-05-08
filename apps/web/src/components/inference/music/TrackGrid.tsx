import { useState } from 'react'
import type { Track } from '@galley/api-client'
import { Waveform } from './Waveform'
import { IconPlay, IconPause, IconStar, IconStarOut, IconPlus } from './icons'

function fmtTime(s: number) {
  if (!s) return '--:--'
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

interface CardProps {
  track: Track
  isCurrent: boolean
  isPlaying: boolean
  onPlay: () => void
  onFav: () => void
  onQueue: () => void
  onDetail: () => void
}

function TrackCard({ track, isCurrent, isPlaying, onPlay, onFav, onQueue, onDetail }: CardProps) {
  const [hovered, setHovered] = useState(false)

  const artBg = `linear-gradient(135deg, ${track.color}, color-mix(in oklab, ${track.color} 40%, #000))`

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onDetail}
      style={{
        background: 'var(--mp-bg-1)',
        border: `1px solid ${isCurrent ? 'var(--mp-accent)' : 'var(--mp-line)'}`,
        borderRadius: 6, cursor: 'pointer', overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
    >
      {/* artwork */}
      <div style={{ height: 110, background: artBg, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.85 }}>
          <Waveform seed={track.id} bars={80} height={110} active={isCurrent ? 0.5 : 0} />
        </div>
        {/* play button */}
        {(hovered || isCurrent) && (
          <button
            onClick={e => { e.stopPropagation(); onPlay() }}
            style={{
              position: 'absolute', bottom: 8, right: 8,
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--mp-accent)', color: '#1a1610',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            {isCurrent && isPlaying ? <IconPause width={14} height={14} /> : <IconPlay width={14} height={14} />}
          </button>
        )}
        {/* fav */}
        <button
          onClick={e => { e.stopPropagation(); onFav() }}
          style={{
            position: 'absolute', top: 6, right: 6,
            width: 26, height: 26, borderRadius: '50%',
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: track.favorite ? 'var(--mp-accent)' : 'rgba(255,255,255,0.6)',
            opacity: hovered || track.favorite ? 1 : 0,
            transition: 'opacity 0.15s',
          }}
        >
          {track.favorite ? <IconStar width={12} height={12} /> : <IconStarOut width={12} height={12} />}
        </button>
      </div>

      {/* body */}
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <span style={{
            fontSize: 13.5, fontWeight: 500,
            color: hovered ? 'var(--mp-accent)' : isCurrent ? 'var(--mp-accent)' : 'var(--mp-fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            transition: 'color 0.15s',
          }}>
            {track.title}
          </span>
          {hovered && (
            <button
              onClick={e => { e.stopPropagation(); onQueue() }}
              title="Add to queue"
              style={{ color: 'var(--mp-fg-3)', flexShrink: 0, marginLeft: 6 }}
            >
              <IconPlus width={12} height={12} />
            </button>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--mp-fg-3)', marginBottom: 8 }}>
          {track.artist || track.source} · {fmtTime(track.duration)}
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mp-accent)' }}>
            {track.genre}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mp-fg-3)' }}>
            {track.mood} · {track.source}
          </span>
        </div>
      </div>
    </div>
  )
}

interface Props {
  tracks: Track[]
  currentId: string | null
  isPlaying: boolean
  onPlay: (id: string) => void
  onFav: (id: string) => void
  onQueue: (id: string) => void
  onDetail: (id: string) => void
}

export function TrackGrid({ tracks, currentId, isPlaying, onPlay, onFav, onQueue, onDetail }: Props) {
  return (
    <div style={{
      flex: 1, overflowY: 'auto',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 16, padding: 16, alignContent: 'start',
    }}>
      {tracks.map(t => (
        <TrackCard
          key={t.id}
          track={t}
          isCurrent={t.id === currentId}
          isPlaying={isPlaying && t.id === currentId}
          onPlay={() => onPlay(t.id)}
          onFav={() => onFav(t.id)}
          onQueue={() => onQueue(t.id)}
          onDetail={() => onDetail(t.id)}
        />
      ))}
    </div>
  )
}
