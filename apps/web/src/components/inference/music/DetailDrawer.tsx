import { useState } from 'react'
import type { Track } from '@galley/api-client'
import { Waveform } from './Waveform'
import { IconX, IconPlay, IconStar, IconStarOut } from './icons'

function fmtTime(s: number) {
  if (!s) return '--:--'
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface Props {
  track: Track
  onClose: () => void
  onPlay: (id: string) => void
  onFav: (id: string) => void
  onUpdate: (patch: Partial<Track>) => void
}

export function DetailDrawer({ track, onClose, onPlay, onFav, onUpdate }: Props) {
  const [newTag, setNewTag] = useState('')

  const artBg = `linear-gradient(135deg, ${track.color}, color-mix(in oklab, ${track.color} 30%, #000))`

  function addTag() {
    const t = newTag.trim()
    if (!t || track.tags.includes(t)) return
    onUpdate({ tags: [...track.tags, t] })
    setNewTag('')
  }

  function removeTag(tag: string) {
    onUpdate({ tags: track.tags.filter(t => t !== tag) })
  }

  const MetaRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={{
      display: 'grid', gridTemplateColumns: '80px 1fr',
      padding: '8px 0', borderBottom: '1px solid var(--mp-line)',
      alignItems: 'start', gap: 8,
    }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, letterSpacing: '0.1em', color: 'var(--mp-fg-4)', textTransform: 'uppercase', paddingTop: 2 }}>
        {label}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--mp-fg-2)', wordBreak: 'break-word' }}>
        {value}
      </span>
    </div>
  )

  return (
    <aside
      className="mp-slide-in"
      style={{
        width: 320, flexShrink: 0,
        background: 'var(--mp-bg-1)',
        borderLeft: '1px solid var(--mp-line)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      {/* close */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 12px 0' }}>
        <button onClick={onClose} style={{ color: 'var(--mp-fg-3)', padding: 4 }}>
          <IconX width={16} height={16} />
        </button>
      </div>

      {/* artwork */}
      <div style={{ height: 140, background: artBg, margin: '0 16px', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.7 }}>
          <Waveform seed={track.id} bars={80} height={140} />
        </div>
      </div>

      {/* title/artist */}
      <div style={{ padding: '16px 16px 12px' }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--mp-fg)', marginBottom: 4 }}>{track.title}</div>
        <div style={{ fontSize: 13, color: 'var(--mp-fg-2)' }}>{track.artist || track.source}</div>
      </div>

      {/* actions */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px' }}>
        <button
          onClick={() => onPlay(track.id)}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 4,
            background: 'var(--mp-accent)', color: '#1a1610',
            fontWeight: 600, fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <IconPlay width={12} height={12} /> Play
        </button>
        <button
          onClick={() => onFav(track.id)}
          style={{
            padding: '9px 16px', borderRadius: 4,
            border: '1px solid var(--mp-line-2)',
            color: track.favorite ? 'var(--mp-accent)' : 'var(--mp-fg-2)',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
          }}
        >
          {track.favorite ? <IconStar width={13} height={13} /> : <IconStarOut width={13} height={13} />}
          {track.favorite ? 'Saved' : 'Save'}
        </button>
      </div>

      {/* metadata */}
      <div style={{ padding: '0 16px', borderTop: '1px solid var(--mp-line)' }}>
        <MetaRow label="Source" value={track.source} />
        {track.source_url && (
          <MetaRow label="URL" value={
            <a href={track.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--mp-accent)', wordBreak: 'break-all', fontSize: 12 }}>
              {track.source_url}
            </a>
          } />
        )}
        <MetaRow label="Genre" value={track.genre} />
        <MetaRow label="Mood" value={track.mood} />
        <MetaRow label="Duration" value={fmtTime(track.duration)} />
        <MetaRow label="License" value={track.license || '—'} />
        <MetaRow label="Added" value={fmtDate(track.added)} />
        <MetaRow label="Plays" value={track.plays} />
      </div>

      {/* attribution */}
      {track.attribution && (
        <div style={{ margin: '12px 16px', padding: '10px 12px', background: 'var(--mp-bg-2)', borderRadius: 4 }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, letterSpacing: '0.1em', color: 'var(--mp-fg-4)', marginBottom: 6 }}>ATTRIBUTION</div>
          <div style={{ fontSize: 12, color: 'var(--mp-fg-3)', fontStyle: 'italic', userSelect: 'all' }}>
            {track.attribution}
          </div>
        </div>
      )}

      {/* tags editor */}
      <div style={{ padding: '0 16px 24px' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, letterSpacing: '0.1em', color: 'var(--mp-fg-4)', marginBottom: 8 }}>TAGS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {track.tags.map(tag => (
            <span
              key={tag}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                background: 'var(--mp-bg-3)', color: 'var(--mp-fg-2)',
                padding: '3px 8px', borderRadius: 99,
              }}
            >
              {tag}
              <button
                onClick={() => removeTag(tag)}
                style={{ color: 'var(--mp-fg-4)', marginLeft: 2, lineHeight: 1 }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--mp-danger)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--mp-fg-4)')}
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTag()}
            placeholder="+ add tag"
            style={{
              width: 100, fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
              background: 'transparent', color: 'var(--mp-fg-2)',
              border: '1px dashed var(--mp-line-2)', borderRadius: 99,
              padding: '3px 8px', outline: 'none',
            }}
          />
        </div>
      </div>
    </aside>
  )
}
