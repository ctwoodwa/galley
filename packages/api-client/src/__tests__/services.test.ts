import { describe, it, expect } from 'vitest'
import {
  type CapabilityId,
  type ServicesConfig,
  defaultServicesConfig,
  getService,
  migrateLegacyToServices,
} from '../services'

describe('defaultServicesConfig', () => {
  it('returns every capability disabled with empty URLs', () => {
    const cfg = defaultServicesConfig()
    const ids: CapabilityId[] = [
      'tts/fast',
      'tts/quality',
      'stt/fast',
      'stt/quality',
      'image',
      'music',
    ]
    for (const id of ids) {
      expect(cfg[id]).toBeDefined()
      expect(cfg[id].enabled).toBe(false)
      expect(cfg[id].baseUrl).toBe('')
    }
  })

  it('seeds default flavors per capability', () => {
    const cfg = defaultServicesConfig()
    expect(cfg['tts/fast'].flavor).toBe('kokoro-local')
    expect(cfg['tts/quality'].flavor).toBe('standard')
    expect(cfg['stt/fast'].flavor).toBe('standard')
    expect(cfg['stt/quality'].flavor).toBe('standard')
  })
})

describe('getService — resolution order', () => {
  const enabledServices: ServicesConfig = {
    'tts/fast': {
      baseUrl: 'http://kokoro:8880',
      apiKey: '',
      enabled: true,
      provider: 'kokoro-fastapi',
      flavor: 'kokoro-local',
    },
    'tts/quality': {
      baseUrl: 'http://higgs:8881',
      apiKey: 'higgs-token',
      enabled: true,
      provider: 'higgs-audio',
      flavor: 'standard',
    },
    'stt/fast': {
      baseUrl: '',
      apiKey: '',
      enabled: true,
      flavor: 'standard',
    },
    'stt/quality': {
      baseUrl: '',
      apiKey: '',
      enabled: false,
      flavor: 'standard',
    },
    image: { baseUrl: '', apiKey: '', enabled: true },
    music: { baseUrl: 'http://music:8830', apiKey: '', enabled: true },
  }

  it('returns slot triple when slot has its own baseUrl', () => {
    const resolved = getService(enabledServices, 'tts/fast')
    expect(resolved).toEqual({
      baseUrl: 'http://kokoro:8880',
      apiKey: '',
      flavor: 'kokoro-local',
    })
  })

  it('returns slot apiKey when set', () => {
    const resolved = getService(enabledServices, 'tts/quality')
    expect(resolved?.apiKey).toBe('higgs-token')
  })

  it('falls back to shared default when slot has empty baseUrl', () => {
    const fallback = { baseUrl: 'http://gateway:9000', apiKey: 'shared-key' }
    const resolved = getService(enabledServices, 'stt/fast', fallback)
    expect(resolved).toEqual({
      baseUrl: 'http://gateway:9000',
      apiKey: 'shared-key',
      flavor: 'standard',
    })
  })

  it('returns null when slot is disabled even if URLs are populated', () => {
    const resolved = getService(enabledServices, 'stt/quality')
    expect(resolved).toBeNull()
  })

  it('returns null when slot has no URL and no fallback', () => {
    const resolved = getService(enabledServices, 'image')
    expect(resolved).toBeNull()
  })

  it('returns null when fallback is provided but its baseUrl is empty', () => {
    const fallback = { baseUrl: '', apiKey: '' }
    const resolved = getService(enabledServices, 'image', fallback)
    expect(resolved).toBeNull()
  })
})

describe('migrateLegacyToServices', () => {
  it('maps remote-mode legacy config to tts/quality slot', () => {
    const services = migrateLegacyToServices({
      baseUrl: 'http://gpu-box:8881',
      apiKey: 'bearer-x',
      ttsSource: 'remote',
      kokoroLocalUrl: 'http://localhost:8880',
    })
    expect(services['tts/quality'].baseUrl).toBe('http://gpu-box:8881')
    expect(services['tts/quality'].apiKey).toBe('bearer-x')
    expect(services['tts/quality'].enabled).toBe(true)
    expect(services['tts/fast'].enabled).toBe(false)
    expect(services['tts/fast'].baseUrl).toBe('http://localhost:8880')
  })

  it('maps kokoro-local mode to tts/fast slot enabled', () => {
    const services = migrateLegacyToServices({
      baseUrl: 'http://gpu-box:8881',
      apiKey: 'bearer-x',
      ttsSource: 'kokoro-local',
      kokoroLocalUrl: 'http://localhost:8880',
    })
    expect(services['tts/fast'].enabled).toBe(true)
    expect(services['tts/quality'].enabled).toBe(false)
  })

  it('enables stt/image/music slots when baseUrl is set', () => {
    const services = migrateLegacyToServices({
      baseUrl: 'http://gpu-box:8881',
      apiKey: 'bearer-x',
      ttsSource: 'remote',
      kokoroLocalUrl: '',
    })
    expect(services['stt/fast'].enabled).toBe(true)
    expect(services.image.enabled).toBe(true)
    expect(services.music.enabled).toBe(true)
  })

  it('disables non-tts slots when baseUrl is empty', () => {
    const services = migrateLegacyToServices({
      baseUrl: '',
      apiKey: '',
      ttsSource: 'kokoro-local',
      kokoroLocalUrl: 'http://localhost:8880',
    })
    expect(services['stt/fast'].enabled).toBe(false)
    expect(services.image.enabled).toBe(false)
    expect(services.music.enabled).toBe(false)
  })

  it('keeps stt/quality slot empty + disabled by default', () => {
    const services = migrateLegacyToServices({
      baseUrl: 'http://gpu-box:8881',
      apiKey: 'bearer-x',
      ttsSource: 'remote',
      kokoroLocalUrl: '',
    })
    expect(services['stt/quality'].enabled).toBe(false)
    expect(services['stt/quality'].baseUrl).toBe('')
  })
})
