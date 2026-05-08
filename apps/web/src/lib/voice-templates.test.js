import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  listTemplates,
  getDefaults,
  setDefaultFor,
  getTemplateForTier,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  templateToRenderConfig,
} from './voice-templates'

const STORAGE_KEY  = 'galley.voice-templates.v3'
const DEFAULTS_KEY = 'galley.voice-template-defaults.v3'

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  localStorage.clear()
})

describe('voice-templates seed', () => {
  it('seeds Fast + Quality on first listTemplates() call', () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    const list = listTemplates()
    expect(list.length).toBe(2)
    expect(list.find(t => t.tier === 'fast')).toMatchObject({ engine: 'kokoro-local', voice: 'af_bella' })
    expect(list.find(t => t.tier === 'quality')).toMatchObject({ engine: 'chatterbox', voice: 'ciufi-galeazzi' })
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('does NOT re-seed on the second call (uses persisted list)', () => {
    listTemplates()
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: 'only', name: 'X', tier: 'fast', engine: 'kokoro', voice: 'af_alloy', speed: 1.0, created_at: 0, updated_at: 0 }]))
    const list = listTemplates()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('only')
  })

  it('returns seed defaults pointing at seed-fast / seed-quality', () => {
    listTemplates()
    expect(getDefaults()).toEqual({ fast: 'seed-fast', quality: 'seed-quality' })
  })
})

describe('getTemplateForTier', () => {
  it('returns the configured default when present', () => {
    listTemplates()
    expect(getTemplateForTier('fast').id).toBe('seed-fast')
    expect(getTemplateForTier('quality').id).toBe('seed-quality')
  })

  it('falls back to first matching-tier template when default is dangling', () => {
    listTemplates()
    setDefaultFor('fast', 'does-not-exist')
    const t = getTemplateForTier('fast')
    expect(t.tier).toBe('fast')
  })

  it('falls back to hardcoded seed when no template matches', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]))  // empty list
    const t = getTemplateForTier('fast')
    expect(t.id).toBe('seed-fast')
  })
})

describe('createTemplate / updateTemplate / deleteTemplate', () => {
  it('appends a new template with sane defaults', () => {
    listTemplates()
    const t = createTemplate({ name: 'My voice', tier: 'quality' })
    expect(t.id).toBeTruthy()
    expect(t.name).toBe('My voice')
    expect(t.tier).toBe('quality')
    expect(t.engine).toBe('kokoro-local')
    expect(t.voice).toBe('af_bella')
    expect(t.speed).toBe(1.0)
    expect(listTemplates()).toHaveLength(3)
  })

  it('coerces unknown tier to fast', () => {
    listTemplates()
    const t = createTemplate({ name: 'X', tier: 'bogus' })
    expect(t.tier).toBe('fast')
  })

  it('updateTemplate patches and bumps updated_at; preserves id', () => {
    listTemplates()
    const before = listTemplates().find(t => t.tier === 'fast')
    const updated = updateTemplate(before.id, { name: 'Renamed', speed: 1.25 })
    expect(updated.id).toBe(before.id)
    expect(updated.name).toBe('Renamed')
    expect(updated.speed).toBe(1.25)
    expect(updated.updated_at).toBeGreaterThanOrEqual(before.updated_at)
  })

  it('updateTemplate returns null for unknown id', () => {
    listTemplates()
    expect(updateTemplate('nope', { name: 'X' })).toBeNull()
  })

  it('deleteTemplate removes and rebinds defaults pointing at it', () => {
    listTemplates()
    const fastId = getDefaults().fast
    deleteTemplate(fastId)
    const list = listTemplates()
    expect(list.find(t => t.id === fastId)).toBeUndefined()
    // Default should rebind to seed when no other fast-tier template exists.
    expect(getDefaults().fast).toBe('seed-fast')
  })
})

describe('templateToRenderConfig', () => {
  it('returns {} for null input', () => {
    expect(templateToRenderConfig(null)).toEqual({})
  })

  it('flattens kokoro-local engine to kokoro on the wire', () => {
    const cfg = templateToRenderConfig({ engine: 'kokoro-local', voice: 'af_bella', speed: 1.0, per_sentence: true })
    expect(cfg.engine).toBe('kokoro')
    expect(cfg.voice).toBe('af_bella')
    expect(cfg.speed).toBe(1.0)
    expect(cfg.per_sentence).toBe(true)
  })

  it('does NOT include a preset key (intentionally — was the source of the female-solo bug)', () => {
    const cfg = templateToRenderConfig({ engine: 'kokoro', voice: 'af_bella', speed: 1.0 })
    expect('preset' in cfg).toBe(false)
  })

  it('includes chatterbox knobs only when engine=chatterbox', () => {
    const cfgK = templateToRenderConfig({ engine: 'kokoro', voice: 'af_bella', speed: 1.0, exaggeration: 0.7, cfg_weight: 0.3, temperature: 0.85 })
    expect(cfgK.exaggeration).toBeUndefined()
    expect(cfgK.cfg_weight).toBeUndefined()
    expect(cfgK.temperature).toBeUndefined()

    const cfgC = templateToRenderConfig({ engine: 'chatterbox', voice: 'ciufi-galeazzi', speed: 0.92, exaggeration: 0.7, cfg_weight: 0.3, temperature: 0.85 })
    expect(cfgC.exaggeration).toBe(0.7)
    expect(cfgC.cfg_weight).toBe(0.3)
    expect(cfgC.temperature).toBe(0.85)
  })

  it('includes base_url when present, omits otherwise', () => {
    const cfg = templateToRenderConfig({ engine: 'kokoro', voice: 'af_bella', speed: 1.0, base_url: 'http://localhost:8880/v1' })
    expect(cfg.base_url).toBe('http://localhost:8880/v1')

    const cfg2 = templateToRenderConfig({ engine: 'kokoro', voice: 'af_bella', speed: 1.0 })
    expect('base_url' in cfg2).toBe(false)
  })
})
