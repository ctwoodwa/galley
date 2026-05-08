import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SttClient } from '../sttClient'

const BASE = 'http://desktop-umt08rn:8881'
const KEY = 'test-key'

describe('SttClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs FormData with default fields', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'hello world', language: 'en', duration: 1.2 }),
    })
    const client = new SttClient(BASE, KEY)
    const result = await client.transcribe(new Blob(['x'], { type: 'audio/webm' }))
    expect(result.text).toBe('hello world')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE}/api/v1/audio/transcriptions`)
    expect(init.method).toBe('POST')
    const fd = init.body as FormData
    expect(fd.get('model')).toBe('whisper-1')
    expect(fd.get('language')).toBe('auto')
    expect(fd.get('response_format')).toBe('verbose_json')
    expect((fd.get('file') as File).name).toBe('recording.webm')
  })

  it('passes through custom options', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'bonjour' }) })
    const client = new SttClient(BASE)
    await client.transcribe(new Blob(['x']), {
      language: 'fr',
      response_format: 'json',
      filename: 'note-1.webm',
    })
    const [, init] = fetchMock.mock.calls[0]
    const fd = init.body as FormData
    expect(fd.get('language')).toBe('fr')
    expect(fd.get('response_format')).toBe('json')
    expect((fd.get('file') as File).name).toBe('note-1.webm')
  })

  it('attaches Bearer token when apiKey set', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ text: '' }) })
    const client = new SttClient(BASE, KEY)
    await client.transcribe(new Blob(['x']))
    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Headers).get('Authorization')).toBe(`Bearer ${KEY}`)
  })

  it('omits Bearer token when apiKey empty', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ text: '' }) })
    const client = new SttClient(BASE)
    await client.transcribe(new Blob(['x']))
    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Headers).get('Authorization')).toBeNull()
  })

  it('throws annotated error on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => 'Unsupported format',
    })
    const client = new SttClient(BASE)
    await expect(client.transcribe(new Blob(['x']))).rejects.toMatchObject({
      message: 'Unsupported format',
      status: 422,
    })
  })
})
