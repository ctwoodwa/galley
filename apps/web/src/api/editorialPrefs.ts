import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Per-book editorial preferences — workspace-scoped settings that today
 * persist to localStorage (one entry per `bookId`) and tomorrow flow
 * through to `book.editorial.yaml` in the book repo via a book-server
 * write-through endpoint.
 *
 * State shape lives flat (one record per book id). The active book is
 * stored separately under `activeBookId`; reading "the current book's
 * prefs" is `prefs[activeBookId] ?? defaultPrefs()`.
 *
 * Migration path to book-server-backed storage:
 *   1. Today: localStorage only. Galley reads from this store; pipelines
 *      that consume editorial prefs (prose-telemetry, voice-pass) can
 *      either also read here or watch for a future event bus.
 *   2. Later: book-server gets PUT /api/books/:bookId/profile/editorial.
 *      This store gains an effect that writes through to the server after
 *      a debounce, plus a hydrate-from-server on mount.
 *   3. Eventually: kernel-sync flows the editorial profile yaml across
 *      paired devices as part of the workspace sync stream.
 */

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
  /** ID of the book whose prefs are currently shown in Settings. */
  activeBookId: string
  /** Map of bookId → preferences. */
  prefs: Record<string, EditorialPrefs>
  setActiveBookId: (id: string) => void
  setPref: <K extends keyof EditorialPrefs>(
    bookId: string,
    key: K,
    value: EditorialPrefs[K],
  ) => void
  resetPrefs: (bookId: string) => void
}

const DEFAULT_ACTIVE_BOOK_ID = 'the-inverted-stack'

export const useEditorialPrefs = create<EditorialPrefsState>()(
  persist(
    (set, get) => ({
      activeBookId: DEFAULT_ACTIVE_BOOK_ID,
      prefs: { [DEFAULT_ACTIVE_BOOK_ID]: defaultPrefs() },
      setActiveBookId: (id) => {
        const { prefs } = get()
        set({
          activeBookId: id,
          prefs: prefs[id] ? prefs : { ...prefs, [id]: defaultPrefs() },
        })
      },
      setPref: (bookId, key, value) => {
        const { prefs } = get()
        const current = prefs[bookId] ?? defaultPrefs()
        set({
          prefs: {
            ...prefs,
            [bookId]: { ...current, [key]: value },
          },
        })
      },
      resetPrefs: (bookId) => {
        const { prefs } = get()
        set({ prefs: { ...prefs, [bookId]: defaultPrefs() } })
      },
    }),
    {
      name: 'galley.editorial-prefs',
      version: 1,
    },
  ),
)

/**
 * Selector helper — returns the current active book's prefs, or
 * defaults when no entry exists yet. Falls through cleanly when a
 * fresh user has no persisted state.
 */
export function useActiveBookPrefs(): EditorialPrefs {
  return useEditorialPrefs((s) => s.prefs[s.activeBookId] ?? defaultPrefs())
}
