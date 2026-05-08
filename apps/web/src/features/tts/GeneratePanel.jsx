import { useState, useEffect, useRef } from 'react'
import { useVoiceTemplates } from '@/lib/useVoiceTemplates'
import { templateToRenderConfig } from '@/lib/voice-templates'
import { useApiConfig } from '@/api/config'
import AudiobookProgress from './AudiobookProgress'

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
          {isRunning && <p className="job-hint">Generation runs in background — safe to navigate away.</p>}
          {isDone    && <p className="job-hint">Audio updated. Reload the player to hear it.</p>}
          {isFailed  && <p className="job-hint">Render failed. See details below.</p>}
          <AudiobookProgress log={log} status={job.status} />
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
  // Bearer token for the remote TTS engines (chatterbox / remote kokoro);
  // pulled from the inference-studio's settings drawer, single source of
  // truth across the app. Without it, audiobook.py exits with an auth error.
  const apiKey = useApiConfig((s) => s.apiKey)
  const [selectedTemplateId, setSelectedTemplateId] = useState(() => defaults.quality)
  const [force, setForce] = useState(false)

  // If saved selection is gone (template deleted at settings), fall back to
  // current quality default → any quality template → any template.
  useEffect(() => {
    if (!templates.find((t) => t.id === selectedTemplateId)) {
      const fallback = templates.find((t) => t.id === defaults.quality)
        ?? templates.find((t) => t.tier === 'quality')
        ?? templates[0]
      if (fallback) setSelectedTemplateId(fallback.id)
    }
  }, [templates, defaults.quality, selectedTemplateId])

  const template = templates.find((t) => t.id === selectedTemplateId) ?? forTier('quality')

  const handle = () => {
    const cfg = templateToRenderConfig(template)
    const needsKey = cfg.engine === 'chatterbox' || cfg.engine === 'kokoro'
    const body = { ...cfg, force, chapter_id: chapter.id }
    if (needsKey && apiKey) body.api_key = apiKey
    if (needsKey && !apiKey) {
      alert(
        'No API key configured for the remote TTS engine.\n\n' +
        'Open the topbar ⚙ → Inference API Settings → paste your Bearer token, ' +
        'or switch to the local-Kokoro template (no key needed).'
      )
      return
    }
    onGenerate(body)
  }

  return (
    <div className="generate-panel">
      <div className="queue-template-picker">
        {templates.length === 0 && (
          <div className="queue-template-empty">
            No voice templates yet. Open the ⚙ in the topbar to create one.
          </div>
        )}
        {templates.map((t) => {
          const isActive = t.id === selectedTemplateId
          const isDefaultFast = defaults.fast === t.id
          const isDefaultQuality = defaults.quality === t.id
          return (
            <button
              key={t.id}
              type="button"
              className={`queue-template-card${isActive ? ' queue-template-card--active' : ''}`}
              onClick={() => setSelectedTemplateId(t.id)}
              title={t.notes || ''}
            >
              <div className="queue-template-card-row">
                <span className={`vts-tier vts-tier--${t.tier}`}>
                  {t.tier === 'fast' ? '⚡' : '🎙'} {t.tier}
                </span>
                <span className="queue-template-card-name">{t.name}</span>
                {(isDefaultFast || isDefaultQuality) && (
                  <span className="queue-template-default" title={`Default for ${isDefaultFast ? 'Fast' : 'Quality'}`}>★</span>
                )}
              </div>
              <div className="queue-template-card-meta">
                {t.engine} · {t.voice}
                {t.speed != null && ` · ${t.speed}×`}
              </div>
            </button>
          )
        })}
      </div>

      <label className="gen-force-check">
        <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
        Force re-render (ignore cache)
      </label>

      <button className="gen-button" onClick={handle}>
        Generate audio
      </button>
      <p className="gen-template-hint">
        To edit voices, knobs, or change the defaults, open the ⚙ in the topbar.
      </p>
    </div>
  )
}
