import { useState, useEffect } from 'react'
import { useVoiceTemplates } from '@/lib/useVoiceTemplates'
import { useApiConfig } from '@/api/config'

/**
 * Engine → live voice catalog. The voice template stores a raw voice ID
 * that audiobook.py forwards as `--voice` straight to the inference server,
 * so the dropdown must show whatever the *server* is willing to accept.
 *
 * - kokoro-local : GET ${kokoroLocalUrl}/v1/audio/voices  (no auth, returns
 *                  string array — see ttsClient.ts FLAVORS for the shape).
 * - kokoro       : GET ${baseUrl}/api/v1/audio/voices?model=kokoro (Bearer)
 * - chatterbox   : GET ${baseUrl}/api/v1/audio/voices?model=higgs  (Bearer)
 */
function useVoiceCatalog(engine) {
  const baseUrl        = useApiConfig((s) => s.baseUrl)
  const apiKey         = useApiConfig((s) => s.apiKey)
  const kokoroLocalUrl = useApiConfig((s) => s.kokoroLocalUrl)
  const [voices, setVoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    let url, opts = {}
    if (engine === 'kokoro-local') {
      url = `${kokoroLocalUrl}/v1/audio/voices`
    } else {
      const model = engine === 'chatterbox' ? 'higgs' : 'kokoro'
      url = `${baseUrl}/api/v1/audio/voices?model=${model}`
      if (apiKey) opts.headers = { Authorization: `Bearer ${apiKey}` }
    }

    fetch(url, opts)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        const raw = data?.voices ?? []
        // Local Kokoro Docker emits a plain string array; remote emits
        // [{id, transcript, sample_rate, is_stock}, …].
        const norm = raw
          .map((v) => (typeof v === 'string' ? { id: v } : v))
          .filter((v) => v && v.id)
        norm.sort((a, b) => a.id.localeCompare(b.id))
        setVoices(norm)
      })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [engine, baseUrl, apiKey, kokoroLocalUrl])

  return { voices, loading, error }
}

const ENGINES = [
  { value: 'kokoro-local', label: 'Kokoro (local Docker · fast · free)' },
  { value: 'kokoro',       label: 'Kokoro (remote GPU · fast)' },
  { value: 'chatterbox',   label: 'Chatterbox (remote GPU · ship-quality)' },
]

const TIERS = [
  { value: 'fast',    label: 'Fast — used while editing' },
  { value: 'quality', label: 'Quality — used for ship/publish renders' },
]

const EMPTY_TEMPLATE = {
  name: '',
  tier: 'fast',
  engine: 'kokoro-local',
  voice: 'af_bella',
  speed: 1.0,
  per_sentence: true,
  exaggeration: 0.7,
  cfg_weight: 0.3,
  temperature: 0.85,
  notes: '',
}

/**
 * Modal-style settings surface for voice templates. CRUD list on the left,
 * editor form on the right. Click a row to edit; the bottom of the editor
 * has Save / Delete / Cancel + a "Set as default for {tier}" action.
 *
 * Mounted from a topbar gear; closes via backdrop click, Esc, or the X.
 */
export default function VoiceTemplatesSettings({ open, onClose }) {
  const { templates, defaults, create, update, remove, setDefault } = useVoiceTemplates()
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_TEMPLATE)

  const beginEdit = (t) => {
    setEditingId(t.id)
    setForm({
      name: t.name,
      tier: t.tier,
      engine: t.engine,
      voice: t.voice,
      speed: t.speed,
      per_sentence: !!t.per_sentence,
      exaggeration: t.exaggeration ?? 0.7,
      cfg_weight: t.cfg_weight ?? 0.3,
      temperature: t.temperature ?? 0.85,
      notes: t.notes ?? '',
    })
  }
  const beginCreate = () => {
    setEditingId('new')
    setForm({ ...EMPTY_TEMPLATE })
  }
  const cancel = () => {
    setEditingId(null)
    setForm(EMPTY_TEMPLATE)
  }

  const save = () => {
    if (!form.name.trim()) {
      alert('Template name is required')
      return
    }
    if (editingId === 'new') {
      const created = create(form)
      setEditingId(created.id)
    } else {
      update(editingId, form)
    }
  }

  const deleteCurrent = () => {
    if (editingId === 'new' || !editingId) { cancel(); return }
    if (!confirm(`Delete template "${form.name}"?`)) return
    remove(editingId)
    cancel()
  }

  const makeDefault = () => {
    if (!editingId || editingId === 'new') return
    setDefault(form.tier, editingId)
  }

  if (!open) return null

  const editing = editingId !== null
  const showChatterboxKnobs = form.engine === 'chatterbox'
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { voices, loading: voicesLoading, error: voicesError } = useVoiceCatalog(form.engine)
  // If the saved voice isn't in the live catalog (deleted, mismatched engine,
  // server cold-start 503), surface it as a (missing) option so the user
  // doesn't lose track of what's stored.
  const voiceMissingFromCatalog = !!form.voice && !voicesLoading && !voicesError
    && !voices.some((v) => v.id === form.voice)

  return (
    <div className="vts-backdrop" onClick={onClose} aria-hidden="true">
      <div
        className="vts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vts-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vts-header">
          <span id="vts-title" className="vts-title">Voice templates</span>
          <button className="vts-close" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        <div className="vts-body">
          {/* List */}
          <aside className="vts-list">
            <button className="vts-new-btn" onClick={beginCreate}>+ New template</button>
            {templates.length === 0 && (
              <div className="vts-empty">No templates yet</div>
            )}
            {templates.map((t) => {
              const isDefaultFast = defaults.fast === t.id
              const isDefaultQuality = defaults.quality === t.id
              return (
                <button
                  key={t.id}
                  className={`vts-row${editingId === t.id ? ' vts-row--active' : ''}`}
                  onClick={() => beginEdit(t)}
                >
                  <div className="vts-row-name">{t.name}</div>
                  <div className="vts-row-meta">
                    <span className={`vts-tier vts-tier--${t.tier}`}>{t.tier}</span>
                    <span className="vts-engine">{t.engine}</span>
                    <span className="vts-voice">{t.voice}</span>
                  </div>
                  {(isDefaultFast || isDefaultQuality) && (
                    <div className="vts-row-default">
                      ★ default {isDefaultFast ? 'Fast' : 'Quality'}
                    </div>
                  )}
                </button>
              )
            })}
          </aside>

          {/* Editor */}
          <section className="vts-editor">
            {!editing ? (
              <div className="vts-placeholder">
                <p>Pick a template on the left to edit, or click <strong>+ New template</strong>.</p>
                <p className="vts-hint">
                  Defaults are auto-used when you choose Fast / Quality on a regenerate form anywhere in galley.
                </p>
              </div>
            ) : (
              <>
                <div className="vts-field">
                  <label>Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Audiobook · Volume 1"
                  />
                </div>

                <div className="vts-field">
                  <label>Tier</label>
                  <select
                    value={form.tier}
                    onChange={(e) => setForm({ ...form, tier: e.target.value })}
                  >
                    {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                <div className="vts-field">
                  <label>Engine</label>
                  <select
                    value={form.engine}
                    onChange={(e) => setForm({ ...form, engine: e.target.value })}
                  >
                    {ENGINES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </div>

                <div className="vts-field">
                  <label>
                    Voice
                    {voicesLoading && <span className="vts-voice-status"> · loading…</span>}
                    {voicesError && <span className="vts-voice-status vts-voice-status--err"> · {voicesError}</span>}
                    {!voicesLoading && !voicesError && voices.length > 0 && (
                      <span className="vts-voice-status"> · {voices.length} available</span>
                    )}
                  </label>
                  {voicesError ? (
                    // Fallback to free-text when the catalog can't be fetched
                    // (cold-start 503, kokoro-local Docker offline, …) so the
                    // user can still save a known-good voice ID.
                    <input
                      type="text"
                      value={form.voice}
                      onChange={(e) => setForm({ ...form, voice: e.target.value })}
                      placeholder="ciufi-galeazzi"
                    />
                  ) : (
                    <select
                      value={form.voice}
                      onChange={(e) => setForm({ ...form, voice: e.target.value })}
                      disabled={voicesLoading}
                    >
                      {voiceMissingFromCatalog && (
                        <option value={form.voice}>{form.voice} (not in current catalog)</option>
                      )}
                      {voices.length === 0 && !voicesLoading && (
                        <option value="">— no voices available —</option>
                      )}
                      {voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.id}{v.transcript ? ` — ${v.transcript.slice(0, 60)}${v.transcript.length > 60 ? '…' : ''}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="vts-field-row">
                  <div className="vts-field vts-field--narrow">
                    <label>Speed</label>
                    <input
                      type="number" step="0.01" min="0.5" max="2.0"
                      value={form.speed}
                      onChange={(e) => setForm({ ...form, speed: parseFloat(e.target.value) || 1.0 })}
                    />
                  </div>
                  <label className="vts-checkbox">
                    <input
                      type="checkbox"
                      checked={!!form.per_sentence}
                      onChange={(e) => setForm({ ...form, per_sentence: e.target.checked })}
                    />
                    Per-sentence chunking
                  </label>
                </div>

                {showChatterboxKnobs && (
                  <details className="vts-advanced">
                    <summary>Chatterbox advanced knobs</summary>
                    <div className="vts-field-row">
                      <div className="vts-field vts-field--narrow">
                        <label>Exaggeration</label>
                        <input
                          type="number" step="0.05" min="0" max="2"
                          value={form.exaggeration}
                          onChange={(e) => setForm({ ...form, exaggeration: parseFloat(e.target.value) })}
                        />
                      </div>
                      <div className="vts-field vts-field--narrow">
                        <label>cfg_weight</label>
                        <input
                          type="number" step="0.05" min="0" max="2"
                          value={form.cfg_weight}
                          onChange={(e) => setForm({ ...form, cfg_weight: parseFloat(e.target.value) })}
                        />
                      </div>
                      <div className="vts-field vts-field--narrow">
                        <label>Temperature</label>
                        <input
                          type="number" step="0.05" min="0" max="2"
                          value={form.temperature}
                          onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })}
                        />
                      </div>
                    </div>
                  </details>
                )}

                <div className="vts-field">
                  <label>Notes (optional)</label>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="When to use this template…"
                  />
                </div>

                <div className="vts-actions">
                  <button className="vts-btn vts-btn--primary" onClick={save}>
                    {editingId === 'new' ? 'Create template' : 'Save changes'}
                  </button>
                  {editingId !== 'new' && (
                    <button className="vts-btn" onClick={makeDefault} title={`Use this template whenever ${form.tier} is selected`}>
                      Set as default for {form.tier}
                    </button>
                  )}
                  {editingId !== 'new' && (
                    <button className="vts-btn vts-btn--danger" onClick={deleteCurrent}>
                      Delete
                    </button>
                  )}
                  <button className="vts-btn vts-btn--ghost" onClick={cancel}>Cancel</button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
