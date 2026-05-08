import type {
  Track,
  TracksResponse,
  LibraryStats,
  SilvermanTrack,
} from './musicTypes'

/**
 * Typed client for the music-library surface of the Windows inference API.
 * All endpoints under `/api/v1/music/*`. Refactored from inference-studio's
 * module-level functions into a class for consistency with TTSClient/ImageClient
 * and to make baseUrl + apiKey injectable per instance (no env-var coupling).
 */
export class MusicClient {
  constructor(
    readonly baseUrl: string,
    readonly apiKey: string = '',
  ) {}

  private auth(headers: Headers = new Headers()): Headers {
    if (this.apiKey) headers.set('Authorization', `Bearer ${this.apiKey}`)
    return headers
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = this.auth(new Headers(init.headers))
    const res = await fetch(`${this.baseUrl}/api/v1/music${path}`, { ...init, headers })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw Object.assign(new Error(`${res.status}: ${text}`), { status: res.status })
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }

  listTracks(params?: Record<string, string>): Promise<TracksResponse> {
    const qs = params && Object.keys(params).length ? '?' + new URLSearchParams(params) : ''
    return this.request(`/tracks${qs}`)
  }

  uploadTracks(
    files: File[],
    meta: { genre: string; mood: string; source: string },
  ): Promise<TracksResponse> {
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    fd.append('genre', meta.genre)
    fd.append('mood', meta.mood)
    fd.append('source', meta.source)
    return this.request('/tracks', { method: 'POST', body: fd })
  }

  fetchTrackUrl(
    url: string,
    source: string,
    genre = 'Ambient',
    mood = 'Neutral',
  ): Promise<TracksResponse> {
    return this.request('/tracks/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, source, genre, mood }),
    })
  }

  patchTrack(id: string, patch: Partial<Track>): Promise<Track> {
    return this.request(`/tracks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  }

  deleteTrack(id: string): Promise<void> {
    return this.request(`/tracks/${id}`, { method: 'DELETE' })
  }

  incrementPlays(id: string): Promise<void> {
    return this.request(`/tracks/${id}/play`, { method: 'POST' })
  }

  getStats(): Promise<LibraryStats> {
    return this.request('/library/stats')
  }

  trackStreamUrl(filePath: string): string {
    const filename = filePath.replace(/^files\//, '')
    return `${this.baseUrl}/api/v1/music/files/${filename}`
  }

  browseSilverman(): Promise<{ tracks: SilvermanTrack[] }> {
    return this.request('/browse/silverman')
  }

  importSilvermanTracks(
    tracks: SilvermanTrack[],
  ): Promise<{ imported: Track[]; errors: { title: string; error: string }[] }> {
    return this.request('/import/silverman', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks }),
    })
  }
}
