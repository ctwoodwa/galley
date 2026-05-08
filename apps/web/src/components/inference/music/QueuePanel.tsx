import type { Track } from '@galley/api-client'
import { IconX } from './icons'

function fmtTime(s: number) {
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

interface Props {
  queue: string[]
  tracks: Track[]
  onClose: () => void
  onClear: () => void
  onRemove: (idx: number) => void
  onPlay: (id: string, idx: number) => void
}

export function QueuePanel({ queue, tracks, onClose, onClear, onRemove, onPlay }: Props) {
  const trackMap = new Map(tracks.map(t => [t.id, t]))

  return (
    <div
      className="mp-fade-in"
      style={{
        position: 'fixed', right: 24, bottom: 80,
        width: 380, maxHeight: '60vh',
        background: 'var(--mp-bg-2)',
        border: '1px solid var(--mp-line-2)',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 100,
      }}
    >
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid var(--mp-line)',
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.1em', color: 'var(--mp-fg-3)', flex: 1 }}>
          UP NEXT ({queue.length})
        </span>
        {queue.length > 0 && (
          <button
            onClick={onClear}
            style={{ fontSize: 11, color: 'var(--mp-fg-4)', marginRight: 12, fontFamily: 'JetBrains Mono, monospace' }}
          >
            clear
          </button>
        )}
        <button onClick={onClose} style={{ color: 'var(--mp-fg-4)' }}>
          <IconX width={14} height={14} />
        </button>
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {queue.length === 0 ? (
          <div style={{ padding: '24px 16px', color: 'var(--mp-fg-4)', fontSize: 13, textAlign: 'center' }}>
            Queue is empty
          </div>
        ) : (
          queue.map((id, idx) => {
            const t = trackMap.get(id)
            if (!t) return null
            return (
              <div
                key={`${id}-${idx}`}
                style={{
                  display: 'grid', gridTemplateColumns: '28px 1fr 100px 40px 28px',
                  alignItems: 'center', gap: 6,
                  padding: '6px 12px',
                  borderBottom: '1px solid var(--mp-line)',
                  cursor: 'default',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--mp-bg-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mp-fg-4)', textAlign: 'center' }}>
                  {idx + 1}
                </span>
                <button
                  onClick={() => onPlay(id, idx)}
                  style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: 'var(--mp-fg)' }}
                >
                  {t.title}
                </button>
                <span style={{ fontSize: 11.5, color: 'var(--mp-fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.artist || t.source}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mp-fg-4)', textAlign: 'right' }}>
                  {fmtTime(t.duration)}
                </span>
                <button onClick={() => onRemove(idx)} style={{ color: 'var(--mp-fg-4)', textAlign: 'center' }}>
                  <IconX width={12} height={12} />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
