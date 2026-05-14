import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorialPrefs } from './editorialPrefs'

const WRITE_THROUGH_DEBOUNCE_MS = 500

function lastFetchPayload(): unknown {
  const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
  expect(calls.length).toBeGreaterThan(0)
  const init = calls[calls.length - 1][1] as RequestInit | undefined
  return init?.body ? JSON.parse(init.body as string) : null
}

describe('useEditorialPrefs — book-server write-through', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
    global.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
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
})
