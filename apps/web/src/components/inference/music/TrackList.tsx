import { useState } from 'react'
import type { Track } from '@galley/api-client'
import { SOURCE_DOT } from '@galley/api-client'
import { IconPlay, IconPause, IconStar, IconStarOut, IconPlus } from './icons'

function fmtTime(s: number) {
  if (!s) return '--:--'
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${r.toString().padStart(2, '0')}`
}


interface RowProps {
  track: Track
  index: number
  isPlaying: boolean
  isCurrent: boolean
  onPlay: () => void
  onFav: () => void
  onQueue: () => void
  onDetail: () => void
}

function TrackRow({ track, index, isPlaying, isCurrent, onPlay, onFav, onQueue, onDetail }: RowProps) {
  const [hovered, setHovered] = useState(false)

  const rowBg = isCurrent
    ? 'color-mix(in oklab, var(--mp-accent) 8%, transparent)'
    : hovered
    ? 'var(--mp-bg-1)'
    : 'transparent'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onPlay}
      onClick={onDetail}
      style={{
        display: 'grid',
        gridTemplateColumns: '52px minmax(180px,2fr) 1.2fr 1.2fr 1fr 1.4fr 52px 36px',
        alignItems: 'center', gap: 0,
        height: 44, padding: '0 8px',
        borderBottom: '1px solid var(--mp-line)',
        background: rowBg,
        cursor: 'default',
        transition: 'background 0.1s',
      }}
    >
      {/* # / play */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {hovered || isCurrent ? (
          <button
            onClick={e => { e.stopPropagation(); onPlay() }}
            style={{
              width: 24, height: 24, borderRadius: '50%',
              background: 'var(--mp-accent)', color: '#1a1610',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {isCurrent && isPlaying ? <IconPause width={10} height={10} /> : <IconPlay width={10} height={10} />}
          </button>
        ) : (
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--mp-fg-4)' }}>
            {index + 1}
          </span>
        )}
      </div>

      {/* title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', paddingRight: 12 }}>
        <button
          onClick={e => { e.stopPropagation(); onFav() }}
          style={{ flexShrink: 0, color: track.favorite ? 'var(--mp-accent)' : 'var(--mp-fg-4)', opacity: hovered || track.favorite ? 1 : 0 }}
        >
          {track.favorite ? <IconStar width={11} height={11} /> : <IconStarOut width={11} height={11} />}
        </button>
        <span style={{
          fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: isCurrent ? 'var(--mp-accent)' : 'var(--mp-fg)',
        }}>
          {track.title}
        </span>
      </div>

      {/* artist */}
      <div style={{ overflow: 'hidden', paddingRight: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--mp-fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {track.artist || '—'}
        </span>
      </div>

      {/* source */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', paddingRight: 12 }}>
        <span style={{ width: 6, height: 6, borderRadius: 1.5, background: SOURCE_DOT[track.source] ?? '#7a7a7a', flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: 'var(--mp-fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {track.source}
        </span>
      </div>

      {/* genre / mood */}
      <div style={{ paddingRight: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--mp-fg-2)' }}>{track.genre}</div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, color: 'var(--mp-fg-3)' }}>{track.mood}</div>
      </div>

      {/* tags */}
      <div style={{ display: 'flex', gap: 4, overflow: 'hidden', paddingRight: 8 }}>
        {track.tags.slice(0, 3).map(t => (
          <span key={t} style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5,
            background: 'var(--mp-bg-3)', color: 'var(--mp-fg-3)',
            padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap',
          }}>
            {t}
          </span>
        ))}
        {track.tags.length > 3 && (
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, color: 'var(--mp-fg-4)' }}>
            +{track.tags.length - 3}
          </span>
        )}
      </div>

      {/* duration */}
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--mp-fg-3)', textAlign: 'right', paddingRight: 8 }}>
        {fmtTime(track.duration)}
      </div>

      {/* queue */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {hovered && (
          <button
            onClick={e => { e.stopPropagation(); onQueue() }}
            title="Add to queue"
            style={{ color: 'var(--mp-fg-3)', padding: 4 }}
          >
            <IconPlus width={12} height={12} />
          </button>
        )}
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

export function TrackList({ tracks, currentId, isPlaying, onPlay, onFav, onQueue, onDetail }: Props) {
  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* header row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '52px minmax(180px,2fr) 1.2fr 1.2fr 1fr 1.4fr 52px 36px',
        padding: '0 8px',
        height: 32,
        alignItems: 'center',
        borderBottom: '1px solid var(--mp-line)',
        position: 'sticky', top: 0,
        background: 'var(--mp-bg)',
        zIndex: 1,
      }}>
        {(['#', 'TITLE', 'ARTIST', 'SOURCE', 'GENRE', 'TAGS', 'DUR', ''] as const).map((h, i) => (
          <span key={i} style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, letterSpacing: '0.1em',
            color: 'var(--mp-fg-4)', textTransform: 'uppercase',
            paddingRight: i === 0 ? 0 : 12, textAlign: i === 0 ? 'center' : 'left',
          }}>
            {h}
          </span>
        ))}
      </div>
      {/* rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tracks.map((t, i) => (
          <TrackRow
            key={t.id}
            track={t}
            index={i}
            isCurrent={t.id === currentId}
            isPlaying={isPlaying && t.id === currentId}
            onPlay={() => onPlay(t.id)}
            onFav={() => onFav(t.id)}
            onQueue={() => onQueue(t.id)}
            onDetail={() => onDetail(t.id)}
          />
        ))}
      </div>
    </div>
  )
}
