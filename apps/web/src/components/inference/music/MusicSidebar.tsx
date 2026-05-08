import { useState, useRef } from 'react'
import { useLocalStorage } from '@/hooks/inference/useLocalStorage'
import type { Section, LibraryStats } from '@galley/api-client'
import { GENRES, SOURCE_DOT } from '@galley/api-client'
import { IconUpload } from './icons'

const SOURCES = ['Silverman Sound', 'Incompetech', 'Musopen', 'Local upload'] as const

function SbRow({
  active, label, count, dot, onClick,
}: {
  active: boolean
  label: string
  count: number
  dot?: string
  onClick: () => void
}) {
  const dotColor = dot ? (SOURCE_DOT[dot] ?? '#7a7a7a') : undefined
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        width: '100%', textAlign: 'left',
        padding: '6px 16px',
        color: active ? 'var(--mp-fg)' : 'var(--mp-fg-2)',
        fontSize: 13,
        borderLeft: `2px solid ${active ? 'var(--mp-accent)' : 'transparent'}`,
        background: active ? 'var(--mp-bg-2)' : 'transparent',
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseEnter={e => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--mp-bg-2)'
      }}
      onMouseLeave={e => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      {dotColor && (
        <span style={{
          width: 6, height: 6, borderRadius: 1.5,
          background: dotColor, flexShrink: 0,
        }} />
      )}
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--mp-fg-4)' }}>
        {count}
      </span>
    </button>
  )
}

interface Props {
  section: Section
  stats: LibraryStats | null
  onSection: (s: Section) => void
  onUpload: () => void
}

export function MusicSidebar({ section, stats, onSection, onUpload }: Props) {
  const total = stats?.total ?? 0
  const favCount = stats?.favorites ?? 0
  const [width, setWidth] = useLocalStorage('is.music.sidebar.width', 220)
  const [dragging, setDragging] = useState(false)
  const startRef = useRef({ x: 0, w: 0 })

  function onHandleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    startRef.current = { x: e.clientX, w: width }
    setDragging(true)

    function onMove(ev: MouseEvent) {
      const next = Math.max(160, Math.min(420, startRef.current.w + ev.clientX - startRef.current.x))
      setWidth(next)
    }
    function onUp() {
      setDragging(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <aside style={{
      width, flexShrink: 0,
      background: 'var(--mp-bg-1)',
      borderRight: '1px solid var(--mp-line)',
      padding: '16px 0',
      overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
      userSelect: dragging ? 'none' : undefined,
    }}>
      {/* resize handle */}
      <div
        onMouseDown={onHandleMouseDown}
        style={{
          position: 'absolute', right: -2, top: 0, bottom: 0, width: 4,
          cursor: 'col-resize', zIndex: 10,
          background: dragging ? 'var(--mp-accent)' : 'transparent',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { if (!dragging) e.currentTarget.style.background = 'color-mix(in oklab, var(--mp-accent) 50%, transparent)' }}
        onMouseLeave={e => { if (!dragging) e.currentTarget.style.background = 'transparent' }}
      />
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 16px 12px' }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.1em', color: 'var(--mp-fg-2)' }}>
          Library
        </span>
        <span style={{ fontSize: 11, color: 'var(--mp-fg-3)', fontFamily: 'JetBrains Mono, monospace' }}>
          {total}
        </span>
      </div>

      <SbRow active={section === 'all'} label="All tracks" count={total} onClick={() => onSection('all')} />
      <SbRow active={section === 'favorites'} label="Favorites" count={favCount} onClick={() => onSection('favorites')} />

      {/* sources */}
      <div style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, letterSpacing: '0.12em',
        color: 'var(--mp-fg-4)', padding: '16px 16px 6px',
      }}>
        SOURCES
      </div>
      {SOURCES.map(src => (
        <SbRow
          key={src}
          active={section === `source:${src}`}
          label={src}
          count={stats?.by_source[src] ?? 0}
          dot={src}
          onClick={() => onSection(`source:${src}` as Section)}
        />
      ))}

      {/* genres */}
      <div style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, letterSpacing: '0.12em',
        color: 'var(--mp-fg-4)', padding: '16px 16px 6px',
      }}>
        GENRES
      </div>
      {GENRES.map(g => (
        <SbRow
          key={g}
          active={section === `genre:${g}`}
          label={g}
          count={stats?.by_genre[g] ?? 0}
          onClick={() => onSection(`genre:${g}` as Section)}
        />
      ))}

      {/* spacer */}
      <div style={{ flex: 1, minHeight: 16 }} />

      {/* upload button */}
      <div style={{ padding: '0 16px' }}>
        <button
          onClick={onUpload}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            width: '100%', padding: '9px 0',
            background: 'var(--mp-accent)', color: '#1a1610',
            fontWeight: 600, fontSize: 12.5, borderRadius: 4,
          }}
        >
          <IconUpload width={14} height={14} />
          Upload
        </button>
      </div>
    </aside>
  )
}
