import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __clearWriteThroughTimers,
  defaultPrefs,
  useEditorialPrefs,
} from './editorialPrefs'

const WRITE_THROUGH_DEBOUNCE_MS = 500

function lastFetchPayload(): unknown {
  const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
  expect(calls.length).toBeGreaterThan(0)
  const init = calls[calls.length - 1][1] as RequestInit | undefined
  return init?.body ? JSON.parse(init.body as string) : null
}

function resetStore(): void {
  __clearWriteThroughTimers()
  window.localStorage.clear()
  useEditorialPrefs.setState({
    prefs: { 'the-inverted-stack': defaultPrefs() },
    meta: {},
  })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('useEditorialPrefs — book-server write-through', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStore()
    global.fetch = vi.fn(
      async () => jsonResponse({ schema_version: 1, updated_at: '2026-05-14T20:00:00.000Z', prefs: null }),
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('schedules a debounced PUT after setPref', async () => {
    useEditorialPrefs.getState().setPref('my-book', 'prosePreset', 'strict')
    expect(global.fetch).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(WRITE_THROUGH_DEBOUNCE_MS)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('/api/books/my-book/profile/editorial')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({
      prefs: {
        activeVoice: '',
        prosePreset: 'strict',
        voicePassMode: 'read-only',
      },
    })
  })

  it('coalesces rapid edits into a single PUT', async () => {
    const { setPref } = useEditorialPrefs.getState()
    setPref('book-x', 'prosePreset', 'gentle')
    setPref('book-x', 'prosePreset', 'standard')
    setPref('book-x', 'prosePreset', 'strict')

    await vi.advanceTimersByTimeAsync(WRITE_THROUGH_DEBOUNCE_MS)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(lastFetchPayload()).toMatchObject({
      prefs: { prosePreset: 'strict' },
    })
  })

  it('writes separate timers per book without cross-cancellation', async () => {
    const { setPref } = useEditorialPrefs.getState()
    setPref('book-a', 'activeVoice', 'anna')
    setPref('book-b', 'activeVoice', 'briar')

    await vi.advanceTimersByTimeAsync(WRITE_THROUGH_DEBOUNCE_MS)

    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBe(2)
    const urls = calls.map((c) => c[0]).sort()
    expect(urls).toEqual([
      '/api/books/book-a/profile/editorial',
      '/api/books/book-b/profile/editorial',
    ])
  })

  it('resetPrefs writes default prefs through', async () => {
    useEditorialPrefs.getState().setPref('book-r', 'prosePreset', 'strict')
    await vi.advanceTimersByTimeAsync(WRITE_THROUGH_DEBOUNCE_MS)
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockClear()

    useEditorialPrefs.getState().resetPrefs('book-r')
    await vi.advanceTimersByTimeAsync(WRITE_THROUGH_DEBOUNCE_MS)

    expect(lastFetchPayload()).toEqual({
      prefs: {
        activeVoice: '',
        prosePreset: 'standard',
        voicePassMode: 'read-only',
      },
    })
  })

  it('swallows fetch failures so they do not propagate', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    useEditorialPrefs.getState().setPref('book-q', 'prosePreset', 'gentle')
    await vi.advanceTimersByTimeAsync(WRITE_THROUGH_DEBOUNCE_MS)
    await vi.runAllTimersAsync()

    expect(warn).toHaveBeenCalled()
    expect(useEditorialPrefs.getState().prefs['book-q'].prosePreset).toBe('gentle')
  })

  it('marks meta dirty + localUpdatedAt on setPref, then clears dirty on PUT success', async () => {
    useEditorialPrefs.getState().setPref('book-m', 'prosePreset', 'strict')
    let meta = useEditorialPrefs.getState().meta['book-m']
    expect(meta.dirty).toBe(true)
    expect(meta.localUpdatedAt).not.toBeNull()
    expect(meta.lastServerSeenAt).toBeNull()

    global.fetch = vi.fn(
      async () => jsonResponse({ schema_version: 1, updated_at: '2026-05-14T20:30:00.000Z', prefs: null }),
    ) as unknown as typeof fetch

    await vi.advanceTimersByTimeAsync(WRITE_THROUGH_DEBOUNCE_MS)
    await vi.runAllTimersAsync()

    meta = useEditorialPrefs.getState().meta['book-m']
    expect(meta.dirty).toBe(false)
    expect(meta.lastServerSeenAt).toBe('2026-05-14T20:30:00.000Z')
  })
})

describe('useEditorialPrefs — hydrate / reconcile', () => {
  beforeEach(() => {
    resetStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('server-wins fallback when meta is unmigrated', async () => {
    const serverPrefs = {
      activeVoice: 'briar',
      prosePreset: 'gentle' as const,
      voicePassMode: 'auto-apply' as const,
    }
    global.fetch = vi.fn(
      async () => jsonResponse({ prefs: serverPrefs, updated_at: '2026-05-14T20:00:00.000Z' }),
    ) as unknown as typeof fetch

    await useEditorialPrefs.getState().hydrate('first-book')

    expect(useEditorialPrefs.getState().prefs['first-book']).toEqual(serverPrefs)
    const meta = useEditorialPrefs.getState().meta['first-book']
    expect(meta.dirty).toBe(false)
    expect(meta.lastServerSeenAt).toBe('2026-05-14T20:00:00.000Z')
  })

  it('discards server response when a local write lands mid-flight', async () => {
    let resolveFetch: (r: Response) => void = () => {}
    global.fetch = vi.fn(
      () => new Promise<Response>((res) => { resolveFetch = res }),
    ) as unknown as typeof fetch

    const hydratePromise = useEditorialPrefs.getState().hydrate('race-book')

    // Local write lands while the GET is in flight.
    useEditorialPrefs.getState().setPref('race-book', 'prosePreset', 'strict')

    // Now the server response arrives (older content).
    resolveFetch(
      jsonResponse({
        prefs: { activeVoice: '', prosePreset: 'gentle', voicePassMode: 'off' },
        updated_at: '2026-05-14T19:00:00.000Z',
      }),
    )
    await hydratePromise

    expect(useEditorialPrefs.getState().prefs['race-book'].prosePreset).toBe('strict')
  })

  it('no-op when server has no sidecar yet', async () => {
    useEditorialPrefs.getState().setPref('solo', 'activeVoice', 'anna')
    global.fetch = vi.fn(
      async () => jsonResponse({ prefs: null, updated_at: null }),
    ) as unknown as typeof fetch

    await useEditorialPrefs.getState().hydrate('solo')

    expect(useEditorialPrefs.getState().prefs['solo'].activeVoice).toBe('anna')
  })

  it('clean + server newer → pull server', async () => {
    useEditorialPrefs.setState({
      prefs: {
        'book-c': { activeVoice: '', prosePreset: 'standard', voicePassMode: 'read-only' },
      },
      meta: {
        'book-c': {
          localUpdatedAt: '2026-05-10T00:00:00.000Z',
          lastServerSeenAt: '2026-05-10T00:00:00.000Z',
          dirty: false,
        },
      },
    })
    global.fetch = vi.fn(
      async () => jsonResponse({
        prefs: { activeVoice: 'briar', prosePreset: 'strict', voicePassMode: 'auto-apply' },
        updated_at: '2026-05-14T00:00:00.000Z',
      }),
    ) as unknown as typeof fetch

    await useEditorialPrefs.getState().hydrate('book-c')

    expect(useEditorialPrefs.getState().prefs['book-c'].prosePreset).toBe('strict')
    expect(useEditorialPrefs.getState().meta['book-c'].lastServerSeenAt)
      .toBe('2026-05-14T00:00:00.000Z')
  })

  it('dirty + server unchanged → keep local (outgoing PUT will sync)', async () => {
    useEditorialPrefs.setState({
      prefs: {
        'book-d': { activeVoice: 'anna', prosePreset: 'strict', voicePassMode: 'read-only' },
      },
      meta: {
        'book-d': {
          localUpdatedAt: '2026-05-14T20:00:00.000Z',
          lastServerSeenAt: '2026-05-14T19:00:00.000Z',
          dirty: true,
        },
      },
    })
    global.fetch = vi.fn(
      async () => jsonResponse({
        prefs: { activeVoice: 'stale', prosePreset: 'gentle', voicePassMode: 'off' },
        updated_at: '2026-05-14T19:00:00.000Z',  // unchanged since lastServerSeenAt
      }),
    ) as unknown as typeof fetch

    await useEditorialPrefs.getState().hydrate('book-d')

    expect(useEditorialPrefs.getState().prefs['book-d'].prosePreset).toBe('strict')
    expect(useEditorialPrefs.getState().meta['book-d'].dirty).toBe(true)
  })

  it('dirty + server newer than local → server wins', async () => {
    useEditorialPrefs.setState({
      prefs: {
        'book-e': { activeVoice: 'anna', prosePreset: 'strict', voicePassMode: 'read-only' },
      },
      meta: {
        'book-e': {
          localUpdatedAt: '2026-05-14T20:00:00.000Z',
          lastServerSeenAt: '2026-05-14T19:00:00.000Z',
          dirty: true,
        },
      },
    })
    global.fetch = vi.fn(
      async () => jsonResponse({
        prefs: { activeVoice: 'briar', prosePreset: 'gentle', voicePassMode: 'off' },
        updated_at: '2026-05-14T21:00:00.000Z',
      }),
    ) as unknown as typeof fetch

    await useEditorialPrefs.getState().hydrate('book-e')

    expect(useEditorialPrefs.getState().prefs['book-e'].activeVoice).toBe('briar')
    expect(useEditorialPrefs.getState().meta['book-e'].dirty).toBe(false)
    expect(useEditorialPrefs.getState().meta['book-e'].lastServerSeenAt)
      .toBe('2026-05-14T21:00:00.000Z')
  })

  it('dedupes concurrent hydrate calls into a single GET', async () => {
    global.fetch = vi.fn(
      async () => jsonResponse({
        prefs: { activeVoice: '', prosePreset: 'standard', voicePassMode: 'read-only' },
        updated_at: '2026-05-14T20:00:00.000Z',
      }),
    ) as unknown as typeof fetch

    await Promise.all([
      useEditorialPrefs.getState().hydrate('dedupe'),
      useEditorialPrefs.getState().hydrate('dedupe'),
      useEditorialPrefs.getState().hydrate('dedupe'),
    ])

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('hydration never emits a write-back PUT', async () => {
    global.fetch = vi.fn(
      async () => jsonResponse({
        prefs: { activeVoice: 'briar', prosePreset: 'gentle', voicePassMode: 'off' },
        updated_at: '2026-05-14T20:00:00.000Z',
      }),
    ) as unknown as typeof fetch

    await useEditorialPrefs.getState().hydrate('readonly-hydrate')

    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBe(1)
    const init = calls[0][1] as RequestInit | undefined
    // GET requests have no method set, or method === 'GET'. Crucially: not PUT.
    expect(init?.method).not.toBe('PUT')
  })
})
