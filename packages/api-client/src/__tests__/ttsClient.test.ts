import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TTSClient } from '../ttsClient'

const BASE = 'http://desktop-umt08rn:8881'
const KEY = 'test-key'

describe('TTSClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('health', () => {
    it('returns parsed health response on 200', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'ok',
          model_loaded: true,
          queue_depth: 0,
          vram_used_gb: 4.2,
        }),
      })
      const client = new TTSClient(BASE, KEY)
      const result = await client.health()
      expect(result.model_loaded).toBe(true)
      expect(fetchMock).toHaveBeenCalledWith(`${BASE}/api/v1/health`)
    })

    it('throws annotated error on non-200', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
      const client = new TTSClient(BASE, KEY)
      await expect(client.health()).rejects.toMatchObject({ message: 'Health check failed', status: 503 })
    })
  })

  describe('listVoices', () => {
    it('passes refresh=1 + model query params when set', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ voices: [] }) })
      const client = new TTSClient(BASE, KEY)
      await client.listVoices(true, 'kokoro')
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/api/v1/audio/voices?refresh=1&model=kokoro`,
        { headers: { Authorization: `Bearer ${KEY}` } },
      )
    })

    it('omits query string when no params', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ voices: [] }) })
      const client = new TTSClient(BASE, KEY)
      await client.listVoices()
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/api/v1/audio/voices`,
        expect.anything(),
      )
    })
  })

  describe('kokoro-local flavor', () => {
    it('uses /v1 prefix and /health (no /api or /v1)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      })
      const client = new TTSClient('http://localhost:8880', '', 'kokoro-local')
      const result = await client.health()
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8880/health')
      // Health response normalized to galley shape
      expect(result).toMatchObject({ status: 'ok', model_loaded: true })
    })

    it('normalizes string-array voices into VoiceInfo[]', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: ['af_alloy', 'af_bella', 'am_adam'] }),
      })
      const client = new TTSClient('http://localhost:8880', '', 'kokoro-local')
      const { voices } = await client.listVoices()
      expect(voices).toHaveLength(3)
      expect(voices[0]).toMatchObject({ id: 'af_alloy', is_stock: true, sample_rate: 24000 })
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8880/v1/audio/voices',
        expect.anything(),
      )
    })

    it('synthesize POSTs to /v1/audio/speech (no /api)', async () => {
      const blob = new Blob(['x'], { type: 'audio/mpeg' })
      fetchMock.mockResolvedValueOnce({ ok: true, blob: async () => blob })
      const client = new TTSClient('http://localhost:8880', '', 'kokoro-local')
      await client.synthesize({ model: 'kokoro', input: 'hi', voice: 'af_heart', response_format: 'mp3' })
      expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8880/v1/audio/speech')
    })

    it('uploadVoice throws (not supported on local Kokoro)', async () => {
      const client = new TTSClient('http://localhost:8880', '', 'kokoro-local')
      await expect(client.uploadVoice('x', new FormData())).rejects.toThrow(/not supported/i)
    })

    it('deleteVoice throws (not supported on local Kokoro)', async () => {
      const client = new TTSClient('http://localhost:8880', '', 'kokoro-local')
      await expect(client.deleteVoice('x')).rejects.toThrow(/not supported/i)
    })

    it('omits Authorization header (no apiKey on local Kokoro)', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ voices: [] }) })
      const client = new TTSClient('http://localhost:8880', '', 'kokoro-local')
      await client.listVoices()
      const [, init] = fetchMock.mock.calls[0]
      expect(init.headers).toEqual({})
    })
  })

  describe('synthesize', () => {
    it('POSTs JSON body and returns blob on success', async () => {
      const blob = new Blob(['fake-audio'], { type: 'audio/mpeg' })
      fetchMock.mockResolvedValueOnce({ ok: true, blob: async () => blob })
      const client = new TTSClient(BASE, KEY)
      const result = await client.synthesize({
        model: 'kokoro',
        input: 'hello',
        voice: 'af_heart',
        response_format: 'mp3',
      })
      expect(result).toBe(blob)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe(`${BASE}/api/v1/audio/speech`)
      expect(init.method).toBe('POST')
      expect(init.headers).toMatchObject({
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
      })
      expect(JSON.parse(init.body)).toMatchObject({ model: 'kokoro', input: 'hello' })
    })

    it('throws with response body text on non-200', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => 'Invalid voice id',
      })
      const client = new TTSClient(BASE, KEY)
      await expect(
        client.synthesize({
          model: 'kokoro',
          input: 'hello',
          voice: 'bogus',
          response_format: 'mp3',
        }),
      ).rejects.toMatchObject({ message: 'Invalid voice id', status: 422 })
    })
  })
})
