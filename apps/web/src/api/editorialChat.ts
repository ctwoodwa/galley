import { create } from 'zustand'

/**
 * Editorial-chat state — per-chapter conversation history.
 *
 * Per-chapter shape: `chats[bookId][chapterId] = ChapterChatState`.
 * Persistence is **sidecar-based**, not Zustand-persist:
 *   - Read from book-server `GET /api/books/:bookId/chats/:chapterId`.
 *   - Write back via debounced PUT to the same endpoint.
 *   - The on-disk file lives at `<bookRoot>/.galley/chats/<chapterId>.json`.
 *
 * That keeps the chat history with the book (git-syncable if the user
 * wants, or .galley/ added to .gitignore for privacy) and out of the
 * browser's localStorage where it would balloon over time.
 *
 * Sending is delegated to a transient `LLMClient` instance built from
 * the `llm` slot config in `useApiConfig`; the store only owns turns.
 */

import type { ChatMessage } from '@galley/api-client'

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatTurn {
  id: string
  role: ChatRole
  content: string
  /** ISO timestamp the turn was appended. */
  timestamp: string
  /** True while an assistant turn is still streaming. */
  streaming?: boolean
  /** Set if the assistant turn errored mid-stream. */
  error?: string
}

export interface ChapterChatState {
  bookId: string
  chapterId: string
  turns: ChatTurn[]
  /** ISO timestamp of the last mutation (drives debounced PUT). */
  lastMutatedAt: string | null
  /** ISO timestamp of the last successful PUT. */
  lastSyncedAt: string | null
  /** True if there are local edits not yet flushed. */
  dirty: boolean
}

interface EditorialChatState {
  chats: Record<string, Record<string, ChapterChatState>>
  /** True between `loadFromSidecar` start and finish (per chapter). */
  loading: Record<string, boolean>
  /** Read sidecar from book-server into local state. */
  load: (bookId: string, chapterId: string) => Promise<void>
  /** Append a turn and trigger a debounced sidecar write. */
  appendTurn: (
    bookId: string,
    chapterId: string,
    turn: Omit<ChatTurn, 'id' | 'timestamp'>,
  ) => string
  /** Patch an existing turn (e.g. append streamed text, mark final). */
  patchTurn: (
    bookId: string,
    chapterId: string,
    turnId: string,
    patch: Partial<ChatTurn>,
  ) => void
  /** Clear a chapter's history both locally and on disk. */
  clear: (bookId: string, chapterId: string) => Promise<void>
}

const WRITE_DEBOUNCE_MS = 1500
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

function chapterKey(bookId: string, chapterId: string): string {
  return `${bookId}::${chapterId}`
}

function freshState(bookId: string, chapterId: string): ChapterChatState {
  return {
    bookId,
    chapterId,
    turns: [],
    lastMutatedAt: null,
    lastSyncedAt: null,
    dirty: false,
  }
}

function nextId(): string {
  // Random base36 — collisions inside one chapter are vanishingly unlikely.
  return Math.random().toString(36).slice(2, 12)
}

function nowIso(): string {
  return new Date().toISOString()
}

async function fetchChatSidecar(
  bookId: string,
  chapterId: string,
): Promise<ChapterChatState | null> {
  try {
    const r = await fetch(
      `/api/books/${encodeURIComponent(bookId)}/chats/${encodeURIComponent(chapterId)}`,
    )
    if (!r.ok) return null
    const body = (await r.json()) as { chat: ChapterChatState | null }
    return body.chat ?? null
  } catch {
    return null
  }
}

async function writeChatSidecar(
  bookId: string,
  chapterId: string,
  chat: ChapterChatState,
): Promise<{ updated_at: string } | null> {
  try {
    const r = await fetch(
      `/api/books/${encodeURIComponent(bookId)}/chats/${encodeURIComponent(chapterId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat }),
      },
    )
    if (!r.ok) return null
    const body = (await r.json()) as { updated_at: string }
    return body
  } catch {
    return null
  }
}

function scheduleWrite(bookId: string, chapterId: string): void {
  const key = chapterKey(bookId, chapterId)
  const prev = pendingTimers.get(key)
  if (prev) clearTimeout(prev)
  const timer = setTimeout(async () => {
    pendingTimers.delete(key)
    const state = useEditorialChat.getState().chats[bookId]?.[chapterId]
    if (!state || !state.dirty) return
    const result = await writeChatSidecar(bookId, chapterId, state)
    if (result) {
      useEditorialChat.setState((s) => ({
        chats: {
          ...s.chats,
          [bookId]: {
            ...s.chats[bookId],
            [chapterId]: {
              ...state,
              lastSyncedAt: result.updated_at,
              dirty: false,
            },
          },
        },
      }))
    }
  }, WRITE_DEBOUNCE_MS)
  pendingTimers.set(key, timer)
}

export const useEditorialChat = create<EditorialChatState>()((set, get) => ({
  chats: {},
  loading: {},

  load: async (bookId, chapterId) => {
    const key = chapterKey(bookId, chapterId)
    if (get().loading[key]) return
    set((s) => ({ loading: { ...s.loading, [key]: true } }))
    try {
      const remote = await fetchChatSidecar(bookId, chapterId)
      const next = remote ?? freshState(bookId, chapterId)
      set((s) => ({
        chats: {
          ...s.chats,
          [bookId]: { ...(s.chats[bookId] ?? {}), [chapterId]: next },
        },
      }))
    } finally {
      set((s) => ({ loading: { ...s.loading, [key]: false } }))
    }
  },

  appendTurn: (bookId, chapterId, partial) => {
    const id = nextId()
    const timestamp = nowIso()
    const turn: ChatTurn = { id, timestamp, ...partial }
    set((s) => {
      const prev = s.chats[bookId]?.[chapterId] ?? freshState(bookId, chapterId)
      const next: ChapterChatState = {
        ...prev,
        turns: [...prev.turns, turn],
        lastMutatedAt: timestamp,
        dirty: true,
      }
      return {
        chats: {
          ...s.chats,
          [bookId]: { ...(s.chats[bookId] ?? {}), [chapterId]: next },
        },
      }
    })
    scheduleWrite(bookId, chapterId)
    return id
  },

  patchTurn: (bookId, chapterId, turnId, patch) => {
    set((s) => {
      const prev = s.chats[bookId]?.[chapterId]
      if (!prev) return s
      const turns = prev.turns.map((t) => (t.id === turnId ? { ...t, ...patch } : t))
      const next: ChapterChatState = {
        ...prev,
        turns,
        lastMutatedAt: nowIso(),
        dirty: true,
      }
      return {
        chats: {
          ...s.chats,
          [bookId]: { ...(s.chats[bookId] ?? {}), [chapterId]: next },
        },
      }
    })
    scheduleWrite(bookId, chapterId)
  },

  clear: async (bookId, chapterId) => {
    set((s) => ({
      chats: {
        ...s.chats,
        [bookId]: {
          ...(s.chats[bookId] ?? {}),
          [chapterId]: freshState(bookId, chapterId),
        },
      },
    }))
    try {
      await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chats/${encodeURIComponent(chapterId)}`,
        { method: 'DELETE' },
      )
    } catch {
      // best-effort delete; local state already cleared
    }
  },
}))

/** Adapter: convert stored turns to the LLM client's ChatMessage[] shape. */
export function turnsToMessages(turns: ChatTurn[]): ChatMessage[] {
  return turns
    .filter((t) => !t.error && t.content.trim().length > 0)
    .map((t) => ({ role: t.role, content: t.content }))
}

/** Test-only: flush any pending debounced timers. */
export function __flushChatTimers(): void {
  for (const t of pendingTimers.values()) clearTimeout(t)
  pendingTimers.clear()
}
