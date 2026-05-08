import { useState, useEffect, useRef, useCallback } from 'react'

const KOKORO_PRESETS = ['male', 'male-solo', 'female', 'female-solo', 'sinek', 'practitioner', 'british', 'fenrir', 'au']
const CHATTERBOX_PRESETS = ['male', 'female-solo', 'broom_salesman', 'sinek', 'practitioner', 'british', 'fenrir', 'fry', 'ciufi-galeazzi']

const PANEL_MIN = 340
const PANEL_MAX = 720
const PANEL_DEFAULT = 420
const PANEL_WIDTH_KEY = 'queue-panel-width'

function presetToVoiceKey(preset) {
  return preset || ''
}

export default function QueuePanel({ chapters, queue, onClose }) {
  const [engine, setEngine] = useState('chatterbox')
  const [preset, setPreset] = useState('ciufi-galeazzi')
  const [voiceKey, setVoiceKey] = useState('ciufi-galeazzi')
  const [replacePrimary, setReplacePrimary] = useState(false)
  const [speed, setSpeed] = useState('')
  const [perSentence, setPerSentence] = useState(true)
  const [forceRender, setForceRender] = useState(true)
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [selectedChapters, setSelectedChapters] = useState(new Set())
  const [chapterFilter, setChapterFilter] = useState('all')
  const [volumeTab, setVolumeTab] = useState('vol-1')

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

  const presets = engine === 'chatterbox' ? CHATTERBOX_PRESETS : KOKORO_PRESETS

  useEffect(() => { setVoiceKey(presetToVoiceKey(preset)) }, [preset])

  useEffect(() => {
    setPreset(engine === 'chatterbox' ? 'ciufi-galeazzi' : 'male')
    setForceRender(engine === 'chatterbox')
    setPerSentence(engine === 'chatterbox')
  }, [engine])

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
    const outputSuffix = replacePrimary ? '' : (voiceKey ? `--${voiceKey}` : '')
    const items = [...selectedChapters].map(chapter_id => ({
      chapter_id,
      options: {
        engine,
        preset,
        voice: voiceKey || undefined,
        speed: speed ? parseFloat(speed) : undefined,
        per_sentence: perSentence || undefined,
        force: forceRender || undefined,
        base_url: baseUrl || undefined,
        api_key: apiKey || undefined,
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
    <div className="queue-panel" style={{ width: panelWidth }}>

      {/* ── Resize handle (left edge) ─────────────────────────────────────── */}
      <div className="queue-resize-handle" onMouseDown={onResizeMouseDown} />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="queue-header">
        <span className="queue-header-title">Render Queue</span>
        <button className="queue-close-btn" onClick={onClose} title="Close">✕</button>
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
              {queue.staged.map(item => (
                <div key={item.queue_id} className="queue-item staged">
                  <span className={`track-dot ${engineDotClass(item.options?.engine)}`} />
                  <span className="queue-item-title">{item.chapter_title}</span>
                  {item.options?.voice && <span className="queue-item-voice">{item.options.voice}</span>}
                  <button className="queue-remove-btn" onClick={() => removeFromStaged(item.queue_id)} title="Remove">✕</button>
                </div>
              ))}
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
              {queue.queue.map(item => (
                <div key={item.queue_id} className="queue-item">
                  <span className={`track-dot ${engineDotClass(item.options?.engine)}`} />
                  <span className="queue-item-title">{item.chapter_title}</span>
                  {item.options?.voice && <span className="queue-item-voice">{item.options.voice}</span>}
                  <button className="queue-remove-btn" onClick={() => removeFromQueue(item.queue_id)} title="Remove">✕</button>
                </div>
              ))}
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

        {/* Options form */}
        <div className="queue-add-form">
          <div className="queue-section-label" style={{ padding: '10px 16px 0' }}>Stage for Rendering</div>
          <div style={{ padding: '8px 16px 0' }}>
            <div className="queue-form-row">
              <label>Engine</label>
              <select value={engine} onChange={e => setEngine(e.target.value)}>
                <option value="kokoro">Kokoro</option>
                <option value="chatterbox">Chatterbox</option>
              </select>
            </div>
            <div className="queue-form-row">
              <label>Preset</label>
              <select value={preset} onChange={e => setPreset(e.target.value)}>
                {presets.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="queue-form-row">
              <label>Voice key</label>
              <input type="text" value={voiceKey} onChange={e => setVoiceKey(e.target.value)}
                placeholder="output suffix (e.g. ciufi-galeazzi)" />
            </div>
            <div className="queue-form-row">
              <label>Speed</label>
              <input type="number" min="0.5" max="2.0" step="0.05"
                placeholder="1.0" value={speed} onChange={e => setSpeed(e.target.value)} />
            </div>
            {engine === 'chatterbox' && (
              <>
                <div className="queue-form-row">
                  <label>Base URL</label>
                  <input type="text" placeholder="http://host:8883/api/v1"
                    value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                </div>
                <div className="queue-form-row">
                  <label>API key</label>
                  <input type="password" placeholder="Bearer token"
                    value={apiKey} onChange={e => setApiKey(e.target.value)} />
                </div>
              </>
            )}
            <div className="queue-form-checks">
              <label><input type="checkbox" checked={replacePrimary} onChange={e => setReplacePrimary(e.target.checked)} />Replace primary (no suffix)</label>
              <label><input type="checkbox" checked={perSentence}    onChange={e => setPerSentence(e.target.checked)} />Per-sentence mode</label>
              <label><input type="checkbox" checked={forceRender}    onChange={e => setForceRender(e.target.checked)} />Force re-render</label>
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
