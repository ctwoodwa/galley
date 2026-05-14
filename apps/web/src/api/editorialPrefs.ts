import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useBookRegistry } from './bookRegistry'

/**
 * Per-book editorial preferences — workspace-scoped settings persisted
 * locally and written through to the book-server, which stores an
 * overlay sidecar at `<bookRoot>/.galley/editorial.json`. The pipeline
 * yaml (`book.editorial.yaml`) is author-owned and never touched.
 *
 * v3 reconciliation model
 * -----------------------
 * Per-book sync metadata + watermark-guarded hydration give multi-
 * machine editing (Mac + Win + Tailscale) a deterministic outcome:
 *
 *   prefs[bookId]            — the per-book preference values.
 *   meta[bookId]             — sync metadata:
 *     localUpdatedAt         — ISO; latest local mutation.
 *     lastServerSeenAt       — ISO; server's `updated_at` from last
 *                              successful PUT or hydration.
 *     dirty                  — local has unsynced mutations vs.
 *                              lastServerSeenAt.
 *
 * Write flow (setPref / resetPrefs):
 *   1. Update prefs immediately so the UI is responsive.
 *   2. Set meta.dirty=true, localUpdatedAt=now.
 *   3. Debounced PUT; on success, replace lastServerSeenAt with the
 *      server-returned updated_at and clear dirty *iff* localUpdatedAt
 *      hasn't advanced since the PUT was scheduled.
 *
 * Hydrate flow (hydrate(bookId)):
 *   1. Capture hydrationStartedAt = Date.now().
 *   2. GET the sidecar.
 *   3. If meta.localUpdatedAt > hydrationStartedAt, discard the
 *      response — a write happened mid-flight, so the local store is
 *      already ahead.
 *   4. Otherwise reconcile by server-stamped LWW:
 *       - server has no sidecar  → no-op (local is authoritative).
 *       - meta unmigrated        → server-wins fallback.
 *       - clean + server newer   → pull server.
 *       - dirty + server unchanged → local wins; outgoing PUT handles it.
 *       - dirty + server changed → newest by timestamp wins; if server,
 *                                   apply and clear dirty.
 *   5. Never write-back as a side effect of hydration.
 *
 * Trigger surface (see `useEditorialHydration`):
 *   - App mount: hydrate the active book once.
 *   - Active-book switch: hydrate the new book once.
 *   - Window focus / visibility: hydrate if lastServerSeenAt is older
 *     than FOCUS_STALENESS_TTL_MS, deduped by an in-flight map.
 *
 * Persist version 3 — adds the `meta` map. The migrate handler leaves
 * meta empty so existing books get the "unmigrated → server-wins on
 * first hydration" path.
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

export interface BookSyncMeta {
  /** ISO timestamp of the latest local mutation. `null` = never edited
   *  locally; the entry was just defaulted into existence. */
  localUpdatedAt: string | null
  /** ISO timestamp returned by the server on the last successful PUT or
   *  GET. `null` = never synced. */
  lastServerSeenAt: string | null
  /** Local has changes that haven't been confirmed by a server PUT. */
  dirty: boolean
}

export function defaultPrefs(): EditorialPrefs {
  return {
    activeVoice: '',
    prosePreset: 'standard',
    voicePassMode: 'read-only',
  }
}

function freshMeta(): BookSyncMeta {
  return { localUpdatedAt: null, lastServerSeenAt: null, dirty: false }
}

interface EditorialPrefsState {
  prefs: Record<string, EditorialPrefs>
  meta: Record<string, BookSyncMeta>
  setPref: <K extends keyof EditorialPrefs>(
    bookId: string,
    key: K,
    value: EditorialPrefs[K],
  ) => void
  resetPrefs: (bookId: string) => void
  /** Compare-and-apply hydration with watermark guard. Idempotent on
   *  concurrent calls — in-flight requests for the same book are
   *  deduplicated. */
  hydrate: (bookId: string) => Promise<void>
}

const DEFAULT_BOOK_ID = 'the-inverted-stack'

const PUT_DEBOUNCE_MS = 500
const FOCUS_STALENESS_TTL_MS = 60_000

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()
const inflightHydrations = new Map<string, Promise<void>>()

function scheduleWriteThrough(bookId: string, prefs: EditorialPrefs): void {
  const existing = pendingTimers.get(bookId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    pendingTimers.delete(bookId)
    void writeEditorialPrefs(bookId, prefs)
  }, PUT_DEBOUNCE_MS)
  pendingTimers.set(bookId, timer)
}

async function writeEditorialPrefs(bookId: string, prefs: EditorialPrefs): Promise<void> {
  const writeStartedAt = Date.now()
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
      return
    }
    const body = (await res.json().catch(() => ({}))) as { updated_at?: string }
    const serverUpdatedAt = body.updated_at ?? new Date().toISOString()

    // Only clear `dirty` if no newer local write has landed since this
    // PUT was scheduled. Otherwise the unsynced delta will be flushed
    // by the next debounced PUT.
    useEditorialPrefs.setState((state) => {
      const current = state.meta[bookId] ?? freshMeta()
      const localAtMs = current.localUpdatedAt
        ? Date.parse(current.localUpdatedAt)
        : -Infinity
      const stillDirty = localAtMs > writeStartedAt
      return {
        meta: {
          ...state.meta,
          [bookId]: {
            ...current,
            lastServerSeenAt: serverUpdatedAt,
            dirty: stillDirty,
          },
        },
      }
    })
  } catch (e) {
    console.warn(
      `[editorialPrefs] write-through error for ${bookId}: ${(e as Error).message}`,
    )
  }
}

export const useEditorialPrefs = create<EditorialPrefsState>()(
  persist(
    (set, get) => ({
      prefs: { [DEFAULT_BOOK_ID]: defaultPrefs() },
      meta: {},
      setPref: (bookId, key, value) => {
        const { prefs, meta } = get()
        const current = prefs[bookId] ?? defaultPrefs()
        const next = { ...current, [key]: value }
        const now = new Date().toISOString()
        set({
          prefs: { ...prefs, [bookId]: next },
          meta: {
            ...meta,
            [bookId]: {
              ...(meta[bookId] ?? freshMeta()),
              localUpdatedAt: now,
              dirty: true,
            },
          },
        })
        scheduleWriteThrough(bookId, next)
      },
      resetPrefs: (bookId) => {
        const { prefs, meta } = get()
        const next = defaultPrefs()
        const now = new Date().toISOString()
        set({
          prefs: { ...prefs, [bookId]: next },
          meta: {
            ...meta,
            [bookId]: {
              ...(meta[bookId] ?? freshMeta()),
              localUpdatedAt: now,
              dirty: true,
            },
          },
        })
        scheduleWriteThrough(bookId, next)
      },
      hydrate: async (bookId: string) => {
        const existing = inflightHydrations.get(bookId)
        if (existing) return existing
        const promise = doHydrate(bookId)
        inflightHydrations.set(bookId, promise)
        try {
          await promise
        } finally {
          inflightHydrations.delete(bookId)
        }
      },
    }),
    {
      name: 'galley.editorial-prefs',
      version: 3,
      migrate: (persistedState: unknown, version: number) => {
        const state = (persistedState ?? {}) as {
          prefs?: Record<string, EditorialPrefs>
          meta?: Record<string, BookSyncMeta>
          activeBookId?: string
        }
        // v1 → v2: drop legacy activeBookId.
        // v2 → v3: add empty meta. Books without metadata fall through
        // the "server-wins on first hydration" path until a write or a
        // hydration round-trip stamps them.
        const prefs = state.prefs ?? { [DEFAULT_BOOK_ID]: defaultPrefs() }
        const meta = version < 3 ? {} : (state.meta ?? {})
        return { prefs, meta }
      },
    },
  ),
)

async function doHydrate(bookId: string): Promise<void> {
  const hydrationStartedAt = Date.now()
  let response: Response
  try {
    response = await fetch(
      `/api/books/${encodeURIComponent(bookId)}/profile/editorial`,
    )
  } catch (e) {
    // Offline or transport error — leave local state alone.
    console.warn(
      `[editorialPrefs] hydrate error for ${bookId}: ${(e as Error).message}`,
    )
    return
  }
  if (!response.ok) {
    // 404 = unknown book on this server; nothing to merge.
    return
  }
  const body = (await response.json().catch(() => null)) as {
    prefs: EditorialPrefs | null
    updated_at: string | null
  } | null
  if (!body) return

  const state = useEditorialPrefs.getState()
  const meta = state.meta[bookId] ?? freshMeta()

  // Watermark guard: if a write landed after the GET began, the local
  // store is already ahead of whatever the server just told us.
  const localUpdatedAtMs = meta.localUpdatedAt
    ? Date.parse(meta.localUpdatedAt)
    : -Infinity
  if (localUpdatedAtMs > hydrationStartedAt) return

  const serverPrefs = body.prefs
  const serverUpdatedAt = body.updated_at
  if (!serverPrefs || !serverUpdatedAt) {
    // Server has no sidecar yet — local is authoritative.
    return
  }
  const serverUpdatedAtMs = Date.parse(serverUpdatedAt)

  const isUnmigrated = meta.lastServerSeenAt === null && !meta.dirty
  if (isUnmigrated) {
    applyServerToStore(bookId, serverPrefs, serverUpdatedAt)
    return
  }

  const lastServerSeenAtMs = meta.lastServerSeenAt
    ? Date.parse(meta.lastServerSeenAt)
    : -Infinity
  const serverChanged = serverUpdatedAtMs > lastServerSeenAtMs

  if (!meta.dirty && serverChanged) {
    applyServerToStore(bookId, serverPrefs, serverUpdatedAt)
    return
  }
  if (meta.dirty && serverChanged) {
    // Both sides changed — newest wins. If local is newer, the in-
    // flight (or next debounced) PUT will push it; do not write-back.
    if (serverUpdatedAtMs > localUpdatedAtMs) {
      applyServerToStore(bookId, serverPrefs, serverUpdatedAt)
    }
    return
  }
  // dirty && !serverChanged   → outgoing PUT will reconcile.
  // !dirty && !serverChanged  → no-op.
}

function applyServerToStore(
  bookId: string,
  serverPrefs: EditorialPrefs,
  serverUpdatedAt: string,
): void {
  useEditorialPrefs.setState((state) => ({
    prefs: { ...state.prefs, [bookId]: serverPrefs },
    meta: {
      ...state.meta,
      [bookId]: {
        localUpdatedAt: serverUpdatedAt,
        lastServerSeenAt: serverUpdatedAt,
        dirty: false,
      },
    },
  }))
}

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

/**
 * Lifecycle hook that wires the three hydration triggers per the v3
 * reconciliation spec:
 *
 *   - Mount of the consumer surface (typically /settings).
 *   - Active-book switch in `useBookRegistry`.
 *   - Window focus / visibility return, gated by FOCUS_STALENESS_TTL_MS
 *     against `meta.lastServerSeenAt`.
 *
 * In-flight hydrations are deduped inside `hydrate()`, so multiple
 * triggers firing in quick succession collapse to one network call.
 */
export function useEditorialHydration(): void {
  const activeBookId = useBookRegistry((s) => s.activeBookId)
  const hydrate = useEditorialPrefs((s) => s.hydrate)

  useEffect(() => {
    if (!activeBookId) return
    void hydrate(activeBookId)

    const onFocus = () => {
      if (!activeBookId) return
      const meta = useEditorialPrefs.getState().meta[activeBookId]
      const seenAtMs = meta?.lastServerSeenAt
        ? Date.parse(meta.lastServerSeenAt)
        : 0
      if (Date.now() - seenAtMs > FOCUS_STALENESS_TTL_MS) {
        void hydrate(activeBookId)
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [activeBookId, hydrate])
}

// Test-only escape hatch — vitest clears module state between suites,
// but pending timers can leak across tests if not flushed.
export function __clearWriteThroughTimers(): void {
  for (const t of pendingTimers.values()) clearTimeout(t)
  pendingTimers.clear()
  inflightHydrations.clear()
}
