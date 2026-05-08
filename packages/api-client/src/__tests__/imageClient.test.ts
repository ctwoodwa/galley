import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageClient } from '../imageClient'

const BASE = 'http://desktop-umt08rn:8881'

describe('ImageClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('generate POSTs params and returns prompt_id', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prompt_id: 'abc-123' }),
    })
    const client = new ImageClient(BASE)
    const result = await client.generate({
      prompt: 'a cat',
      width: 512,
      height: 512,
      steps: 20,
      seed: 42,
    })
    expect(result).toEqual({ prompt_id: 'abc-123' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE}/api/v1/image/generate`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toMatchObject({ prompt: 'a cat' })
  })

  it('getStatus returns parsed status', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'done', images: [{ filename: 'x.png', subfolder: '', type: 'output' }] }),
    })
    const client = new ImageClient(BASE)
    const result = await client.getStatus('abc-123')
    expect(result.status).toBe('done')
    expect(result.images).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/api/v1/image/status/abc-123`, expect.anything())
  })

  it('viewUrl builds correct query string', () => {
    const client = new ImageClient(BASE)
    const url = client.viewUrl('result.png', 'subdir')
    expect(url).toBe(`${BASE}/api/v1/image/view?filename=result.png&subfolder=subdir&type=output`)
  })

  it('waitForCompletion returns first image when status=done', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'processing' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'done',
          images: [{ filename: 'r.png', subfolder: '', type: 'output' }],
        }),
      })
    const client = new ImageClient(BASE)
    // Use vitest fake timers so the 2s setTimeout resolves immediately
    vi.useFakeTimers()
    const promise = client.waitForCompletion('p1')
    await vi.advanceTimersByTimeAsync(2100)
    const result = await promise
    expect(result.filename).toBe('r.png')
    vi.useRealTimers()
  })

  it('waitForCompletion throws on status=error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'error', error: 'OOM' }),
    })
    const client = new ImageClient(BASE)
    await expect(client.waitForCompletion('p2')).rejects.toThrow('OOM')
  })

  it('sends Authorization header when apiKey provided', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ prompt_id: 'x' }) })
    const client = new ImageClient(BASE, 'secret')
    await client.generate({ prompt: 'x', width: 1, height: 1, steps: 1, seed: 0 })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers).toMatchObject({ Authorization: 'Bearer secret' })
  })
})
