/**
 * Voice templates — named bundles of TTS synthesis parameters that the user
 * picks once + reuses across the app. The audio-regen surfaces (chapter
 * GeneratePanel, sentence-edit Phase E, QueuePanel add-form) all collapse
 * their per-form engine/voice/speed/cfg/temperature fields into a single
 * Fast / Quality choice — the actual params come from the user's chosen
 * template for that tier.
 *
 * Persistence: localStorage. Single user / single browser today; will move to
 * server-side per-user settings file when galley grows multi-device or
 * the Sunfish-Node audit ledger lands (planned in 2026-05-11 intake).
 *
 * Schema:
 *   {
 *     id: string,            // stable; uuid-ish, used for default refs
 *     name: string,
 *     tier: 'fast' | 'quality',
 *     engine: 'kokoro' | 'kokoro-local' | 'chatterbox',
 *     voice: string,
 *     speed: number,
 *     per_sentence?: boolean,
 *     exaggeration?: number, // chatterbox only
 *     cfg_weight?: number,   // chatterbox only
 *     temperature?: number,  // chatterbox only
 *     base_url?: string,     // optional override
 *     api_key_ref?: string,  // optional reference to a stored key (placeholder)
 *     notes?: string,
 *     created_at: number,
 *     updated_at: number,
 *   }
 */

// Bumped v2 → v3 (2026-05-08): the v2 fix had it backwards. audiobook.py's
// preset catalog is for its CHAPTER_PRESET_MAP abstraction; the *voice*
// catalog on the live Kokoro-FastAPI server (port 8880) only knows raw IDs
// (af_bella, am_michael, …). Per-template, we now send `--voice af_bella`
// directly and skip `--preset`; audiobook.py's default preset ('male')
// passes its own validation, then args.voice overrides cfg.voice on
// audiobook.py:1804. Old localStorage now ignored.
const STORAGE_KEY = 'galley.voice-templates.v3'
const DEFAULTS_KEY = 'galley.voice-template-defaults.v3'

function uid() {
  // Browser-friendly short id. Not crypto-grade; just stable enough.
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// NOTE: `voice` is the *raw voice ID* from the live /audio/voices catalog —
// for kokoro that's af_bella, am_michael, etc.; for chatterbox/higgs it's
// the cloned-clip ID like ciufi-galeazzi or belinda. We forward this as
// audiobook.py's `--voice` flag, which overrides any preset-resolved voice.
const FAST_DEFAULT = {
  id: 'seed-fast',
  name: 'Quick draft (Fast)',
  tier: 'fast',
  engine: 'kokoro-local',
  voice: 'af_bella',
  speed: 1.0,
  per_sentence: true,
  notes: 'Local Kokoro Docker — instant feedback while editing. No API key needed.',
  created_at: 0,
  updated_at: 0,
}

const QUALITY_DEFAULT = {
  id: 'seed-quality',
  name: 'Audiobook (Quality)',
  tier: 'quality',
  engine: 'chatterbox',
  voice: 'ciufi-galeazzi',
  speed: 0.92,
  per_sentence: true,
  exaggeration: 0.7,
  cfg_weight: 0.3,
  temperature: 0.85,
  notes: 'Chatterbox on the GPU — ship voice. ~30-90s per sentence.',
  created_at: 0,
  updated_at: 0,
}

const SEED_TEMPLATES = [FAST_DEFAULT, QUALITY_DEFAULT]
const SEED_DEFAULTS = { fast: FAST_DEFAULT.id, quality: QUALITY_DEFAULT.id }

export function listTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // First load — seed defaults.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_TEMPLATES))
      localStorage.setItem(DEFAULTS_KEY, JSON.stringify(SEED_DEFAULTS))
      return [...SEED_TEMPLATES]
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...SEED_TEMPLATES]
    return parsed
  } catch {
    return [...SEED_TEMPLATES]
  }
}

export function getDefaults() {
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY)
    if (!raw) return { ...SEED_DEFAULTS }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...SEED_DEFAULTS }
    return { fast: parsed.fast || SEED_DEFAULTS.fast, quality: parsed.quality || SEED_DEFAULTS.quality }
  } catch {
    return { ...SEED_DEFAULTS }
  }
}

export function setDefaultFor(tier, templateId) {
  if (tier !== 'fast' && tier !== 'quality') return
  const defaults = getDefaults()
  defaults[tier] = templateId
  try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults)) } catch {}
}

export function getTemplateForTier(tier) {
  const defaults = getDefaults()
  const targetId = defaults[tier]
  const list = listTemplates()
  // Prefer the user's chosen default; fall back to the first matching tier;
  // ultimate fallback is the hardcoded seed.
  const byId = list.find((t) => t.id === targetId)
  if (byId) return byId
  const byTier = list.find((t) => t.tier === tier)
  if (byTier) return byTier
  return tier === 'fast' ? FAST_DEFAULT : QUALITY_DEFAULT
}

export function createTemplate(template) {
  const list = listTemplates()
  const now = Date.now()
  const next = {
    id: template.id || uid(),
    name: template.name || 'Untitled',
    tier: template.tier === 'quality' ? 'quality' : 'fast',
    engine: template.engine || 'kokoro-local',
    voice: template.voice || 'af_bella',
    speed: typeof template.speed === 'number' ? template.speed : 1.0,
    per_sentence: !!template.per_sentence,
    exaggeration: template.exaggeration,
    cfg_weight: template.cfg_weight,
    temperature: template.temperature,
    base_url: template.base_url,
    notes: template.notes || '',
    created_at: now,
    updated_at: now,
  }
  list.push(next)
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch {}
  return next
}

export function updateTemplate(id, patch) {
  const list = listTemplates()
  const idx = list.findIndex((t) => t.id === id)
  if (idx < 0) return null
  const updated = { ...list[idx], ...patch, id: list[idx].id, updated_at: Date.now() }
  list[idx] = updated
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch {}
  return updated
}

export function deleteTemplate(id) {
  let list = listTemplates()
  list = list.filter((t) => t.id !== id)
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch {}
  // If we deleted a default, fall back to the first matching-tier remaining
  // template (or the seed if none).
  const defaults = getDefaults()
  let dirty = false
  for (const tier of ['fast', 'quality']) {
    if (defaults[tier] === id) {
      const replacement = list.find((t) => t.tier === tier)
      defaults[tier] = replacement ? replacement.id : (tier === 'fast' ? FAST_DEFAULT.id : QUALITY_DEFAULT.id)
      dirty = true
    }
  }
  if (dirty) {
    try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults)) } catch {}
  }
}

/**
 * Convert a template to the payload the existing book-server /generate
 * endpoint expects. Keeps the regen API surface unchanged at the wire
 * level — the template system is a pure UI compression.
 */
export function templateToRenderConfig(template) {
  if (!template) return {}
  // We only send `voice` (the raw catalog ID), not `preset`. audiobook.py
  // takes its default preset ('male', valid in both PRESETS_KOKORO and
  // PRESETS_CHATTERBOX), then `args.voice or cfg["voice"]` lets the
  // template's voice win. Sending `--preset` here was the previous bug —
  // it forced the user's voice through audiobook.py's preset catalog
  // (female-solo / ciufi-galeazzi / …), which doesn't match the live
  // Kokoro-FastAPI voice catalog and produced 400 "Voice 'female' not
  // found" errors. See audiobook.py:1789-1814.
  const cfg = {
    engine: template.engine === 'kokoro-local' ? 'kokoro' : template.engine,
    voice: template.voice,
    speed: template.speed,
    per_sentence: !!template.per_sentence,
  }
  if (template.engine === 'chatterbox') {
    if (template.exaggeration != null) cfg.exaggeration = template.exaggeration
    if (template.cfg_weight != null)   cfg.cfg_weight = template.cfg_weight
    if (template.temperature != null)  cfg.temperature = template.temperature
  }
  if (template.base_url) cfg.base_url = template.base_url
  return cfg
}
