import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useBookRegistry } from './bookRegistry'

/**
 * Per-book editorial preferences — workspace-scoped settings persisted
 * locally (one entry per `bookId`) and written through to the book-
 * server, which stores an overlay sidecar at
 * `<bookRoot>/.galley/editorial.json`. The pipeline-config yaml
 * (`book.editorial.yaml`) is author-owned and never touched by galley.
 *
 * State shape: a flat map `prefs[bookId] -> EditorialPrefs`. Which book
 * is "currently active" lives in `useBookRegistry`, not here — this
 * store is purely the per-book preference data.
 *
 * Write-through: every `setPref` schedules a debounced PUT against
 * `/api/books/:bookId/profile/editorial`. The local store is the
 * source of truth — server writes are best-effort and don't block
 * UI updates. Failures are logged but don't propagate.
 *
 * Hydrate-on-mount is deferred — when the user has multiple machines
 * editing the same book through Tailscale, we'll want last-writer-
 * wins reconciliation; for now local always wins.
 *
 * Persist version 2: drops the now-redundant `activeBookId` (moved to
 * useBookRegistry). The migrate handler strips it from older state.
 */

const PUT_DEBOUNCE_MS = 500
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleWriteThrough(bookId: string, prefs: EditorialPrefs) {
  const existing = pendingTimers.get(bookId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    pendingTimers.delete(bookId)
    void writeEditorialPrefs(bookId, prefs)
  }, PUT_DEBOUNCE_MS)
  pendingTimers.set(bookId, timer)
}

async function writeEditorialPrefs(bookId: string, prefs: EditorialPrefs): Promise<void> {
  try {
    const res = await fetch(
      `/api/books/${encodeURIComponent(bookId)}/profile/editorial`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefs }),
      },
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(
        `[editorialPrefs] write-through failed for ${bookId}: ${res.status} ${text}`,
      )
    }
  } catch (e) {
    console.warn(
      `[editorialPrefs] write-through error for ${bookId}: ${(e as Error).message}`,
    )
  }
}

export type ProsePreset = 'gentle' | 'standard' | 'strict'
export type VoicePassMode = 'off' | 'read-only' | 'auto-apply'

export interface EditorialPrefs {
  /** Narrator voice ID — references one of the book's registered voices
   *  in book.editorial.yaml (when synced). Free text today. */
  activeVoice: string
  /** Tier preset for prose-review severity. Maps to per-detector
   *  thresholds inside the prose-telemetry pipeline. */
  prosePreset: ProsePreset
  /** Behavior of the voice-pass agent. `off` = skip. `read-only` =
   *  surface suggestions inline; never edit. `auto-apply` = rewrite
   *  flagged passages without confirmation. */
  voicePassMode: VoicePassMode
}

export function defaultPrefs(): EditorialPrefs {
  return {
    activeVoice: '',
    prosePreset: 'standard',
    voicePassMode: 'read-only',
  }
}

interface EditorialPrefsState {
  prefs: Record<string, EditorialPrefs>
  setPref: <K extends keyof EditorialPrefs>(
    bookId: string,
    key: K,
    value: EditorialPrefs[K],
  ) => void
  resetPrefs: (bookId: string) => void
}

const DEFAULT_BOOK_ID = 'the-inverted-stack'

export const useEditorialPrefs = create<EditorialPrefsState>()(
  persist(
    (set, get) => ({
      prefs: { [DEFAULT_BOOK_ID]: defaultPrefs() },
      setPref: (bookId, key, value) => {
        const { prefs } = get()
        const current = prefs[bookId] ?? defaultPrefs()
        const next = { ...current, [key]: value }
        set({
          prefs: {
            ...prefs,
            [bookId]: next,
          },
        })
        scheduleWriteThrough(bookId, next)
      },
      resetPrefs: (bookId) => {
        const { prefs } = get()
        const next = defaultPrefs()
        set({ prefs: { ...prefs, [bookId]: next } })
        scheduleWriteThrough(bookId, next)
      },
    }),
    {
      name: 'galley.editorial-prefs',
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        const state = (persistedState ?? {}) as {
          prefs?: Record<string, EditorialPrefs>
          activeBookId?: string
        }
        if (version < 2) {
          // Drop legacy activeBookId; bookRegistry owns it now.
          return { prefs: state.prefs ?? { [DEFAULT_BOOK_ID]: defaultPrefs() } }
        }
        return state as { prefs: Record<string, EditorialPrefs> }
      },
    },
  ),
)

/**
 * Selector helper — returns the current active book's prefs (active id
 * sourced from useBookRegistry), or defaults when no entry exists yet.
 */
export function useActiveBookPrefs(): EditorialPrefs {
  const activeBookId = useBookRegistry((s) => s.activeBookId)
  return useEditorialPrefs(
    (s) => s.prefs[activeBookId] ?? defaultPrefs(),
  )
}
