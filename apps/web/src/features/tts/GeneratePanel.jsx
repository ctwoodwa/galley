import { useState, useEffect, useRef } from 'react'

const KOKORO_PRESETS = ['male', 'male-solo', 'female', 'female-solo', 'sinek', 'practitioner', 'british', 'fenrir', 'au']
const CHATTERBOX_PRESETS = ['male', 'female-solo', 'broom_salesman', 'sinek', 'practitioner', 'british', 'fenrir', 'fry', 'ciufi-galeazzi']

const SOURCE_LABELS = {
  manifest:     'from last render',
  'chapter-map':'from chapter plan',
  default:      'global default',
}

const EMPTY_CONFIG = {
  engine: 'kokoro',
  preset: 'male',
  voice: '',
  speed: '',
  exaggeration: '',
  cfg_weight: '',
  temperature: '',
  base_url: '',
  api_key: '',
  force: false,
  per_sentence: false,
  no_chapter_map: false,
}

export default function GeneratePanel({ bookId, chapter, onGenerated }) {
  const [config, setConfig]         = useState(EMPTY_CONFIG)
  const [defaultSource, setSource]  = useState(null)   // 'manifest' | 'chapter-map' | 'default'
  const [loadingDefaults, setLoadingDefaults] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [job, setJob]               = useState(null)
  const [log, setLog]               = useState('')
  const [polling, setPolling]       = useState(false)
  const pollRef                     = useRef(null)

  const presets = config.engine === 'chatterbox' ? CHATTERBOX_PRESETS : KOKORO_PRESETS

  // ── Load per-chapter defaults ─────────────────────────────────────────────
  useEffect(() => {
    setJob(null)
    setLog('')
    setPolling(false)
    if (pollRef.current) clearInterval(pollRef.current)
    setLoadingDefaults(true)

    fetch(`/api/books/${bookId}/chapters/${chapter.id}/render-defaults`)
      .then(r => r.json())
      .then(d => {
        setSource(d.source)
        setConfig({
          engine:       d.engine       ?? 'kokoro',
          preset:       d.preset       ?? 'male',
          voice:        d.voice        ?? '',
          speed:        d.speed        != null ? String(d.speed) : '',
          exaggeration: d.exaggeration != null ? String(d.exaggeration) : '',
          cfg_weight:   d.cfg_weight   != null ? String(d.cfg_weight)   : '',
          temperature:  d.temperature  != null ? String(d.temperature)  : '',
          base_url:     d.base_url     ?? '',
          api_key:      d.api_key      ?? '',
          force:        false,
          per_sentence: d.per_sentence ?? false,
          no_chapter_map: false,
        })
        setLoadingDefaults(false)
      })
      .catch(() => {
        setConfig(EMPTY_CONFIG)
        setSource('default')
        setLoadingDefaults(false)
      })
  }, [chapter.id])

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // ── Job polling ───────────────────────────────────────────────────────────
  const startPolling = (jobId) => {
    setPolling(true)
    pollRef.current = setInterval(async () => {
      try {
        const [jobRes, logRes] = await Promise.all([
          fetch(`/api/jobs/${jobId}`).then(r => r.json()),
          fetch(`/api/jobs/${jobId}/log?tail=60`).then(r => r.json()),
        ])
        setJob(jobRes)
        setLog(logRes.log || '')
        if (jobRes.status !== 'running') {
          clearInterval(pollRef.current)
          setPolling(false)
          if (jobRes.status === 'done' && onGenerated) onGenerated()
        }
      } catch {}
    }, 2000)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    const body = { chapter_id: chapter.id, engine: config.engine, preset: config.preset }
    if (config.voice)          body.voice = config.voice
    if (config.speed)          body.speed = parseFloat(config.speed)
    if (config.base_url)       body.base_url = config.base_url
    if (config.api_key)        body.api_key = config.api_key
    if (config.force)          body.force = true
    if (config.per_sentence)   body.per_sentence = true
    if (config.no_chapter_map) body.no_chapter_map = true
    if (config.engine === 'chatterbox') {
      if (config.exaggeration) body.exaggeration = parseFloat(config.exaggeration)
      if (config.cfg_weight)   body.cfg_weight   = parseFloat(config.cfg_weight)
      if (config.temperature)  body.temperature  = parseFloat(config.temperature)
    }
    try {
      const res = await fetch(`/api/books/${bookId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const newJob = await res.json()
      setJob(newJob)
      setLog('')
      startPolling(newJob.id)
    } catch (err) {
      alert(`Failed to start generation: ${err.message}`)
    }
  }

  const set = (key, value) => setConfig(c => ({ ...c, [key]: value }))

  // ── Render ────────────────────────────────────────────────────────────────
  const isRunning = job?.status === 'running'
  const isDone    = job?.status === 'done'
  const isFailed  = job?.status === 'failed'

  if (loadingDefaults) {
    return <div className="generate-panel"><span className="spinner" style={{ margin: '8px 0' }} /></div>
  }

  if (job) {
    return (
      <div className="generate-panel">
        <div className="job-status">
          <div className={`job-badge ${job.status}`}>
            {isRunning && <span className="spinner" />}
            {isRunning ? 'Generating…' : isDone ? '✓ Done' : '✗ Failed'}
          </div>
          {isRunning && <p className="job-hint">Generation runs in background — safe to navigate away.</p>}
          {isDone    && <p className="job-hint">Audio updated. Reload the player to hear it.</p>}
          {isFailed  && <p className="job-hint">Check the log below for errors.</p>}
          {log && <pre className="job-log">{log}</pre>}
          {(isDone || isFailed) && (
            <button className="gen-button secondary" onClick={() => { setJob(null); setLog('') }}>
              {isFailed ? 'Try again' : 'Generate again'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="generate-panel">
      {defaultSource && (
        <div className="defaults-badge">
          Defaults <span className="defaults-source">{SOURCE_LABELS[defaultSource] ?? defaultSource}</span>
        </div>
      )}

      <div className="gen-config">
        <div className="config-row">
          <label>Engine</label>
          <select value={config.engine} onChange={e => set('engine', e.target.value)}>
            <option value="kokoro">Kokoro (local Docker)</option>
            <option value="chatterbox">Chatterbox (Windows GPU)</option>
          </select>
        </div>

        <div className="config-row">
          <label>Preset</label>
          <select value={config.preset} onChange={e => set('preset', e.target.value)}>
            {presets.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <button className="advanced-toggle" onClick={() => setShowAdvanced(v => !v)}>
          {showAdvanced ? '▲' : '▼'} Advanced options
        </button>

        {showAdvanced && (
          <div className="advanced-options">
            <div className="config-row">
              <label>Voice override</label>
              <input type="text" placeholder="e.g. broom_salesman" value={config.voice}
                onChange={e => set('voice', e.target.value)} />
            </div>

            <div className="config-row">
              <label>Speed <span className="hint">0.5–2.0</span></label>
              <input type="number" min="0.5" max="2.0" step="0.05" placeholder="1.0"
                value={config.speed} onChange={e => set('speed', e.target.value)} />
            </div>

            {config.engine === 'chatterbox' && (<>
              <div className="config-row">
                <label>Exaggeration <span className="hint">0.0–1.5</span></label>
                <input type="number" min="0" max="1.5" step="0.05" placeholder="0.7"
                  value={config.exaggeration} onChange={e => set('exaggeration', e.target.value)} />
              </div>
              <div className="config-row">
                <label>Cfg weight <span className="hint">0.1–1.0</span></label>
                <input type="number" min="0.1" max="1.0" step="0.05" placeholder="0.3"
                  value={config.cfg_weight} onChange={e => set('cfg_weight', e.target.value)} />
              </div>
              <div className="config-row">
                <label>Temperature <span className="hint">0.0–2.0</span></label>
                <input type="number" min="0" max="2.0" step="0.1" placeholder="1.0"
                  value={config.temperature} onChange={e => set('temperature', e.target.value)} />
              </div>
              <div className="config-row">
                <label>Base URL</label>
                <input type="text" placeholder="http://host:8883/api/v1"
                  value={config.base_url} onChange={e => set('base_url', e.target.value)} />
              </div>
              <div className="config-row">
                <label>API key</label>
                <input type="password" placeholder="Bearer token"
                  value={config.api_key} onChange={e => set('api_key', e.target.value)} />
              </div>
            </>)}

            <div className="config-checks">
              <label><input type="checkbox" checked={config.force}
                onChange={e => set('force', e.target.checked)} /> Force re-render</label>
              <label><input type="checkbox" checked={config.per_sentence}
                onChange={e => set('per_sentence', e.target.checked)} /> Per-sentence mode</label>
              <label><input type="checkbox" checked={config.no_chapter_map}
                onChange={e => set('no_chapter_map', e.target.checked)} /> No chapter map</label>
            </div>
          </div>
        )}
      </div>

      <button className="gen-button" onClick={handleGenerate}>
        Generate Audio
      </button>
    </div>
  )
}
