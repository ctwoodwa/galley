import { useState, useEffect, useRef } from 'react'
import { useVoiceTemplates } from '@/lib/useVoiceTemplates'
import { templateToRenderConfig } from '@/lib/voice-templates'

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
  // Driven by the SimpleGenerateForm below — receives a config payload built
  // from the user's chosen voice template + Fast/Quality tier.
  const runGenerate = async (body) => {
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

  return <SimpleGenerateForm chapter={chapter} onGenerate={runGenerate} />
}

// ──────────────────────────────────────────────────────────────────────────
// Simplified Fast / Quality form. Voice/engine/knobs come from the user's
// voice templates (see /lib/voice-templates.js + the gear-icon settings).
function SimpleGenerateForm({ chapter, onGenerate }) {
  const { defaults, templates, forTier } = useVoiceTemplates()
  const [tier, setTier] = useState('quality')
  const [force, setForce] = useState(false)
  const template = forTier(tier)
  const defaultsForTier = templates.find((t) => t.id === defaults[tier])

  const handle = () => {
    const cfg = templateToRenderConfig(template)
    onGenerate({ ...cfg, force, chapter_id: chapter.id })
  }

  return (
    <div className="generate-panel">
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
        {!defaultsForTier && (
          <span className="gen-template-warn">No default set for {tier} — using fallback.</span>
        )}
      </div>

      <label className="gen-force-check">
        <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
        Force re-render (ignore cache)
      </label>

      <button className="gen-button" onClick={handle}>
        Generate audio
      </button>
      <p className="gen-template-hint">
        To edit voices, knobs, or change the default for Fast/Quality, open the ⚙ in the topbar.
      </p>
    </div>
  )
}
