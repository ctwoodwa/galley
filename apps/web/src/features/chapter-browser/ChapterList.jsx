import { useMemo, useState } from 'react'

export default function ChapterList({ chapters, selectedId, onSelect }) {
  const [collapsed, setCollapsed] = useState({})

  const sections = useMemo(() => {
    const map = new Map()
    for (const ch of chapters) {
      if (!map.has(ch.section)) map.set(ch.section, { label: ch.section_label, chapters: [] })
      map.get(ch.section).chapters.push(ch)
    }
    return [...map.values()]
  }, [chapters])

  const toggleSection = key => setCollapsed(c => ({ ...c, [key]: !c[key] }))

  return (
    <div className="chapter-list">
      {sections.map(section => (
        <div key={section.label} className="section">
          <button
            className="section-header"
            onClick={() => toggleSection(section.label)}
          >
            <span className="section-arrow">{collapsed[section.label] ? '▶' : '▼'}</span>
            <span className="section-label">{section.label}</span>
            <span className="section-count">
              {section.chapters.filter(c => c.has_audio).length}/{section.chapters.length}
              {' '}🔊
            </span>
          </button>
          {!collapsed[section.label] && (
            <div className="section-chapters">
              {section.chapters.map(ch => (
                <button
                  key={ch.id}
                  className={`chapter-item ${selectedId === ch.id ? 'selected' : ''} ${ch.has_audio ? 'has-audio' : ''}`}
                  onClick={() => onSelect(ch.id)}
                  title={ch.title}
                >
                  <span className="chapter-title">{ch.title}</span>
                  {ch.has_audio && (
                    <span
                      className={`audio-dot ${ch.audio_info?.engine === 'chatterbox' ? 'dot-quality' : 'dot-draft'}`}
                      title={ch.audio_info ? `${ch.audio_info.engine} · ${ch.audio_info.voice || ch.audio_info.preset}` : 'Audio available'}
                    />
                  )}
                  {!ch.has_audio && ch.planned_preset && (
                    <span className="audio-dot dot-planned" title={`Planned: ${ch.planned_preset}`} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
