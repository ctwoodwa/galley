import { useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

const SECTION_HEADER_PX = 30
const CHAPTER_ITEM_PX = 32

/**
 * Virtualized chapter list. Sections + chapter rows are flattened into a
 * single row array, then react-virtual renders only the visible rows.
 * Drop-in replacement for the previous non-virtualized version — same
 * className contract for App.css selectors.
 */
export default function ChapterList({ chapters, selectedId, onSelect }) {
  const [collapsed, setCollapsed] = useState({})
  const parentRef = useRef(null)

  const sections = useMemo(() => {
    const map = new Map()
    for (const ch of chapters) {
      if (!map.has(ch.section)) map.set(ch.section, { label: ch.section_label, key: ch.section, chapters: [] })
      map.get(ch.section).chapters.push(ch)
    }
    return [...map.values()]
  }, [chapters])

  // Flatten into rows, respecting collapsed state.
  const rows = useMemo(() => {
    const out = []
    for (const section of sections) {
      const isCollapsed = !!collapsed[section.label]
      const audioCount = section.chapters.filter((c) => c.has_audio).length
      out.push({
        type: 'section',
        label: section.label,
        sectionKey: section.key,
        collapsed: isCollapsed,
        audioCount,
        total: section.chapters.length,
      })
      if (!isCollapsed) {
        for (const ch of section.chapters) {
          out.push({ type: 'chapter', chapter: ch })
        }
      }
    }
    return out
  }, [sections, collapsed])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i].type === 'section' ? SECTION_HEADER_PX : CHAPTER_ITEM_PX),
    overscan: 8,
  })

  const toggleSection = (key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }))

  return (
    <div ref={parentRef} className="chapter-list">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const row = rows[vi.index]
          const style = {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${vi.start}px)`,
          }
          if (row.type === 'section') {
            return (
              <div key={`s:${row.label}`} style={style} className="section">
                <button className="section-header" onClick={() => toggleSection(row.label)}>
                  <span className="section-arrow">{row.collapsed ? '▶' : '▼'}</span>
                  <span className="section-label">{row.label}</span>
                  <span className="section-count">
                    {row.audioCount}/{row.total} 🔊
                  </span>
                </button>
              </div>
            )
          }
          const ch = row.chapter
          return (
            <div key={`c:${ch.id}`} style={style} className="section-chapters">
              <button
                className={`chapter-item ${selectedId === ch.id ? 'selected' : ''} ${ch.has_audio ? 'has-audio' : ''}`}
                onClick={() => onSelect(ch.id)}
                title={ch.title}
              >
                <span className="chapter-title">{ch.title}</span>
                {ch.has_audio && (
                  <span
                    className={`audio-dot ${ch.audio_info?.engine === 'chatterbox' ? 'dot-quality' : 'dot-draft'}`}
                    title={
                      ch.audio_info
                        ? `${ch.audio_info.engine} · ${ch.audio_info.voice || ch.audio_info.preset}`
                        : 'Audio available'
                    }
                  />
                )}
                {!ch.has_audio && ch.planned_preset && (
                  <span className="audio-dot dot-planned" title={`Planned: ${ch.planned_preset}`} />
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
