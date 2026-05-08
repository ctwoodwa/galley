import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MusicClient } from '../musicClient'

const BASE = 'http://desktop-umt08rn:8881'
const KEY = 'test-key'

describe('MusicClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('listTracks GETs /tracks with no params', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ tracks: [], total: 0 }) })
    const client = new MusicClient(BASE, KEY)
    await client.listTracks()
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/api/v1/music/tracks`, expect.anything())
  })

  it('listTracks appends query string when params provided', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ tracks: [], total: 0 }) })
    const client = new MusicClient(BASE, KEY)
    await client.listTracks({ genre: 'Ambient', mood: 'Calm' })
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/api/v1/music/tracks?genre=Ambient&mood=Calm`,
      expect.anything(),
    )
  })

  it('attaches Bearer token when apiKey provided', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ tracks: [], total: 0 }) })
    const client = new MusicClient(BASE, KEY)
    await client.listTracks()
    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Headers).get('Authorization')).toBe(`Bearer ${KEY}`)
  })

  it('omits Bearer token when apiKey is empty', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ tracks: [], total: 0 }) })
    const client = new MusicClient(BASE)
    await client.listTracks()
    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Headers).get('Authorization')).toBeNull()
  })

  it('deleteTrack returns void on 204', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 })
    const client = new MusicClient(BASE, KEY)
    await expect(client.deleteTrack('id-1')).resolves.toBeUndefined()
  })

  it('throws annotated error on non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'not found',
    })
    const client = new MusicClient(BASE, KEY)
    await expect(client.deleteTrack('missing')).rejects.toMatchObject({
      message: '404: not found',
      status: 404,
    })
  })

  it('trackStreamUrl strips files/ prefix', () => {
    const client = new MusicClient(BASE, KEY)
    expect(client.trackStreamUrl('files/song.mp3')).toBe(`${BASE}/api/v1/music/files/song.mp3`)
    expect(client.trackStreamUrl('song.mp3')).toBe(`${BASE}/api/v1/music/files/song.mp3`)
  })

  it('patchTrack PATCHes with JSON body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'id-1', favorite: true }),
    })
    const client = new MusicClient(BASE, KEY)
    await client.patchTrack('id-1', { favorite: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE}/api/v1/music/tracks/id-1`)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ favorite: true })
  })
})
