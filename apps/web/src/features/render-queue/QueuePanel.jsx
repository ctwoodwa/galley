import { useState, useEffect, useRef, useCallback } from 'react'
import { SortableQueueList } from './SortableQueueList'
import { useVoiceTemplates } from '@/lib/useVoiceTemplates'
import { templateToRenderConfig } from '@/lib/voice-templates'

const PANEL_MIN = 340
const PANEL_MAX = 720
const PANEL_DEFAULT = 420
const PANEL_WIDTH_KEY = 'queue-panel-width'

export default function QueuePanel({ chapters, queue, onClose, inline = false }) {
  // Render-config now comes from the user's voice template for the chosen tier.
  // Per-form engine/preset/voice/speed/exaggeration/cfg/temperature inputs
  // removed; user manages those at the topbar ⚙ → Voice Templates settings.
  const { forTier, templates, defaults } = useVoiceTemplates()
  const [tier, setTier] = useState('quality')
  const [replacePrimary, setReplacePrimary] = useState(false)
  const [forceRender, setForceRender] = useState(true)
  const [selectedChapters, setSelectedChapters] = useState(new Set())
  const [chapterFilter, setChapterFilter] = useState('all')
  const [volumeTab, setVolumeTab] = useState('vol-1')

  const template = forTier(tier)
  const hasDefault = !!templates.find((t) => t.id === defaults[tier])

  const [activeLog, setActiveLog] = useState('')
  const logPollRef = useRef(null)

  // ── Resize ──────────────────────────────────────────────────────────────────
  const [panelWidth, setPanelWidth] = useState(
    () => parseInt(localStorage.getItem(PANEL_WIDTH_KEY) || PANEL_DEFAULT, 10)
  )
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)

  const onResizeMouseDown = useCallback(e => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startW.current = panelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [panelWidth])

  useEffect(() => {
    const onMouseMove = e => {
      if (!dragging.current) return
      const delta = startX.current - e.clientX
      const next = Math.min(PANEL_MAX, Math.max(PANEL_MIN, startW.current + delta))
      setPanelWidth(next)
    }
    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setPanelWidth(w => { localStorage.setItem(PANEL_WIDTH_KEY, w); return w })
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // (engine/preset/voice/speed/perSentence/exaggeration/cfg_weight/temperature
  //  state previously lived here — moved to voice-template settings.)

  useEffect(() => {
    if (logPollRef.current) clearInterval(logPollRef.current)
    if (queue.active?.job_id) {
      const poll = async () => {
        try {
          const r = await fetch(`/api/jobs/${queue.active.job_id}/log?tail=40`)
          const d = await r.json()
          setActiveLog(d.log || '')
        } catch {}
      }
      poll()
      logPollRef.current = setInterval(poll, 2000)
    } else {
      setActiveLog('')
    }
    return () => { if (logPollRef.current) clearInterval(logPollRef.current) }
  }, [queue.active?.job_id])

  // Count per-volume for tab badges
  const countFor = (vol, filter) => chapters.filter(ch => {
    if (ch.volume !== vol) return false
    if (filter === 'no-audio') return !ch.has_audio
    if (filter === 'no-quality') return !(ch.tracks && ch.tracks.some(t => t.engine === 'chatterbox'))
    return true
  }).length

  const filteredChapters = chapters.filter(ch => {
    if (ch.volume !== volumeTab) return false
    if (chapterFilter === 'no-audio') return !ch.has_audio
    if (chapterFilter === 'no-quality') return !(ch.tracks && ch.tracks.some(t => t.engine === 'chatterbox'))
    return true
  })

  const toggleChapter = id => {
    setSelectedChapters(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAll  = () => setSelectedChapters(new Set(filteredChapters.map(c => c.id)))
  const selectNone = () => setSelectedChapters(new Set())

  const handleAddToQueue = async () => {
    if (selectedChapters.size === 0) return
    const cfg = templateToRenderConfig(template)
    const voiceForSuffix = template?.voice || ''
    const outputSuffix = replacePrimary ? '' : (voiceForSuffix ? `--${voiceForSuffix}` : '')
    const items = [...selectedChapters].map(chapter_id => ({
      chapter_id,
      options: {
        ...cfg,
        force: forceRender || undefined,
        output_suffix: outputSuffix || undefined,
      },
    }))
    try {
      await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      setSelectedChapters(new Set())
    } catch (err) {
      alert(`Failed to stage: ${err.message}`)
    }
  }

  const removeFromQueue  = async qid => { try { await fetch(`/api/queue/${qid}`, { method: 'DELETE' }) } catch {} }
  const removeFromStaged = async qid => { try { await fetch(`/api/queue/staged/${qid}`, { method: 'DELETE' }) } catch {} }
  const handleProcess    = async () => { try { await fetch('/api/queue/process', { method: 'POST' }) } catch (err) { alert(`Failed: ${err.message}`) } }
  const clearQueue       = async () => { try { await fetch('/api/queue', { method: 'DELETE' }) } catch {} }

  const engineDotClass = eng => eng === 'chatterbox' ? 'dot-chatterbox' : eng === 'kokoro' ? 'dot-kokoro' : 'dot-unknown'
  const statusLabel    = s   => s === 'done' ? '✓' : s === 'failed' ? '✗' : s === 'running' ? '…' : ''

  return (
    <div className={`queue-panel${inline ? ' queue-panel--inline' : ''}`} style={inline ? undefined : { width: panelWidth }}>

      {/* ── Resize handle (left edge) — drawer mode only ─────────────────── */}
      {!inline && <div className="queue-resize-handle" onMouseDown={onResizeMouseDown} />}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="queue-header">
        <span className="queue-header-title">Render Queue</span>
        {onClose && (
          <button className="queue-close-btn" onClick={onClose} title="Close">✕</button>
        )}
      </div>

      {/* ── Jobs: active + staged + pending + history ─────────────────────── */}
      <div className="queue-panel-jobs">
        {queue.active && (
          <div className="queue-section">
            <div className="queue-section-label">Active</div>
            <div className="queue-item active">
              <span className="spinner" style={{ flexShrink: 0 }} />
              <span className="queue-item-title">{queue.active.chapter_title}</span>
              {queue.active.options?.voice && (
                <span className={`track-dot ${engineDotClass(queue.active.options?.engine)}`} />
              )}
            </div>
            {activeLog && <pre className="queue-log">{activeLog}</pre>}
          </div>
        )}

        {queue.staged?.length > 0 && (
          <div className="queue-section">
            <div className="queue-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Staged ({queue.staged.length})</span>
              <button className="queue-process-btn" onClick={handleProcess}>
                ▶ Process {queue.staged.length} item{queue.staged.length !== 1 ? 's' : ''}
              </button>
            </div>
            <div className="queue-items-list">
              <SortableQueueList
                items={queue.staged}
                reorderEndpoint="/api/queue/staged/order"
                renderItem={(item, dragProps) => (
                  <div className="queue-item staged" {...dragProps} style={{ cursor: 'grab' }}>
                    <span className={`track-dot ${engineDotClass(item.options?.engine)}`} />
                    <span className="queue-item-title">{item.chapter_title}</span>
                    {item.options?.voice && <span className="queue-item-voice">{item.options.voice}</span>}
                    <button
                      className="queue-remove-btn"
                      onClick={(e) => { e.stopPropagation(); removeFromStaged(item.queue_id) }}
                      onPointerDown={(e) => e.stopPropagation()}
                      title="Remove"
                    >✕</button>
                  </div>
                )}
              />
            </div>
          </div>
        )}

        {queue.queue.length > 0 && (
          <div className="queue-section">
            <div className="queue-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Pending ({queue.queue.length})</span>
              <button className="queue-clear-btn" onClick={clearQueue}>Clear all</button>
            </div>
            <div className="queue-items-list">
              <SortableQueueList
                items={queue.queue}
                reorderEndpoint="/api/queue/order"
                renderItem={(item, dragProps) => (
                  <div className="queue-item" {...dragProps} style={{ cursor: 'grab' }}>
                    <span className={`track-dot ${engineDotClass(item.options?.engine)}`} />
                    <span className="queue-item-title">{item.chapter_title}</span>
                    {item.options?.voice && <span className="queue-item-voice">{item.options.voice}</span>}
                    <button
                      className="queue-remove-btn"
                      onClick={(e) => { e.stopPropagation(); removeFromQueue(item.queue_id) }}
                      onPointerDown={(e) => e.stopPropagation()}
                      title="Remove"
                    >✕</button>
                  </div>
                )}
              />
            </div>
          </div>
        )}

        {queue.history.length > 0 && (
          <div className="queue-section">
            <div className="queue-section-label">Recent ({Math.min(queue.history.length, 5)})</div>
            <div className="queue-items-list">
              {queue.history.slice(0, 5).map(item => (
                <div key={item.queue_id} className={`queue-item ${item.status}`}>
                  <span className="queue-item-status">{statusLabel(item.status)}</span>
                  <span className="queue-item-title">{item.chapter_title}</span>
                  {item.options?.voice && <span className="queue-item-voice">{item.options.voice}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Stage for Rendering — fills remaining space ───────────────────── */}
      <div className="queue-add-section">

        {/* Options form — Fast/Quality picker (engine/voice/knobs come from
            the user's voice template for the chosen tier; manage at ⚙). */}
        <div className="queue-add-form">
          <div className="queue-section-label" style={{ padding: '10px 16px 0' }}>Stage for Rendering</div>
          <div style={{ padding: '8px 16px 0' }}>
            <div className="gen-tier-row">
              <button
                type="button"
                className={`gen-tier-btn${tier === 'fast' ? ' gen-tier-btn--active' : ''}`}
                onClick={() => setTier('fast')}
              >
                ⚡ Fast
                <span className="gen-tier-sub">edit-loop preview</span>
              </button>
              <button
                type="button"
                className={`gen-tier-btn${tier === 'quality' ? ' gen-tier-btn--active' : ''}`}
                onClick={() => setTier('quality')}
              >
                🎙 Quality
                <span className="gen-tier-sub">ship voice</span>
              </button>
            </div>
            <div className="gen-template-info">
              Using template: <strong>{template?.name || '(default)'}</strong>
              <span className="gen-template-meta">
                {template?.engine} · {template?.voice}
                {template?.speed != null && ` · ${template.speed}×`}
              </span>
              {!hasDefault && (
                <span className="gen-template-warn">No default set for {tier} — using fallback.</span>
              )}
            </div>
            <div className="queue-form-checks">
              <label>
                <input type="checkbox" checked={replacePrimary} onChange={e => setReplacePrimary(e.target.checked)} />
                Replace primary (no suffix)
              </label>
              <label>
                <input type="checkbox" checked={forceRender} onChange={e => setForceRender(e.target.checked)} />
                Force re-render
              </label>
            </div>
          </div>
        </div>

        {/* Volume tabs */}
        <div className="queue-vol-tabs">
          {[['vol-1', 'Vol 1'], ['vol-2', 'Vol 2']].map(([val, label]) => (
            <button
              key={val}
              className={`queue-vol-tab${volumeTab === val ? ' active' : ''}`}
              onClick={() => setVolumeTab(val)}
            >
              {label}
              <span className="queue-vol-count">{countFor(val, chapterFilter)}</span>
            </button>
          ))}
        </div>

        {/* Status filter + shortcuts */}
        <div className="queue-filter-bar">
          <div className="queue-status-tabs">
            {[['all', 'All'], ['no-quality', 'No Quality'], ['no-audio', 'No Audio']].map(([val, label]) => (
              <button
                key={val}
                className={`queue-status-tab${chapterFilter === val ? ' active' : ''}`}
                onClick={() => setChapterFilter(val)}
              >{label}</button>
            ))}
          </div>
          <div className="queue-chapter-shortcuts">
            <button className="queue-shortcut-btn" onClick={selectAll}>all</button>
            <span className="queue-shortcut-sep">·</span>
            <button className="queue-shortcut-btn" onClick={selectNone}>none</button>
            {selectedChapters.size > 0 && (
              <span className="queue-shortcut-count">{selectedChapters.size}</span>
            )}
          </div>
        </div>

        {/* Chapter list — fills remaining height */}
        <div className="queue-chapter-list">
          {filteredChapters.map(ch => (
            <label key={ch.id} className="queue-chapter-row">
              <input type="checkbox" checked={selectedChapters.has(ch.id)} onChange={() => toggleChapter(ch.id)} />
              <span className="queue-chapter-name">{ch.title}</span>
            </label>
          ))}
          {filteredChapters.length === 0 && (
            <div className="queue-chapter-empty">No chapters match this filter</div>
          )}
        </div>

        {/* Stage button — pinned to bottom */}
        <div className="queue-stage-footer">
          <button className="queue-add-btn" onClick={handleAddToQueue} disabled={selectedChapters.size === 0}>
            Stage {selectedChapters.size > 0 ? `${selectedChapters.size} ` : ''}Selected
          </button>
        </div>

      </div>
    </div>
  )
}
