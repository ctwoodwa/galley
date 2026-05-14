import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Book registry — galley's local view of which books this device knows
 * about, which one is active, and where each book repo lives on disk.
 *
 * Today: localStorage only, single-device. Each book entry is a
 * lightweight pointer (no chapters cached here; that's the book-server's
 * job). Future migration: kernel-sync flows this registry across paired
 * devices as part of the user-scope (this-device) sync stream — but
 * actually the registry is environment-scope, since repoPath is
 * inherently per-machine. So even with full sync, the registry stays
 * local-per-device while the per-book editorial prefs (workspace scope)
 * sync across devices.
 *
 * activeBookId lives here rather than in useEditorialPrefs because the
 * registry is the source of truth for which books exist; editorial
 * prefs is a per-book preference map keyed by book id.
 */

export interface BookRecord {
  /** Stable identifier; convention: directory-friendly slug matching the
   *  book repo name. Used as the key into per-book editorial prefs and
   *  as the lookup into galley/prose/books/<id>.yaml. */
  id: string
  /** Human-readable title shown in galley UI. Defaults to `id` at add
   *  time; user can edit. */
  displayName: string
  /** Absolute filesystem path to the book repo on this machine.
   *  Tailscale topologies: this is the LOCAL path; remote nodes have
   *  their own bookRegistry entries with their own repoPath values. */
  repoPath: string
  /** ISO timestamp when this entry was added — used for sort fallback. */
  addedAt: string
}

interface BookRegistryState {
  books: Record<string, BookRecord>
  activeBookId: string
  setActiveBookId: (id: string) => void
  addBook: (record: Omit<BookRecord, 'addedAt'>) => boolean
  removeBook: (id: string) => void
  updateBook: (
    id: string,
    patch: Partial<Omit<BookRecord, 'id' | 'addedAt'>>,
  ) => void
}

const DEFAULT_BOOK_ID = 'the-inverted-stack'

function seedBook(): BookRecord {
  return {
    id: DEFAULT_BOOK_ID,
    displayName: 'The Inverted Stack',
    repoPath: '~/Projects/SunfishSoftware/the-inverted-stack',
    addedAt: new Date().toISOString(),
  }
}

export const useBookRegistry = create<BookRegistryState>()(
  persist(
    (set, get) => ({
      books: { [DEFAULT_BOOK_ID]: seedBook() },
      activeBookId: DEFAULT_BOOK_ID,
      setActiveBookId: (id) => {
        const { books } = get()
        if (books[id]) set({ activeBookId: id })
      },
      addBook: (record) => {
        const { books } = get()
        if (books[record.id]) return false
        set({
          books: {
            ...books,
            [record.id]: { ...record, addedAt: new Date().toISOString() },
          },
        })
        return true
      },
      removeBook: (id) => {
        const { books, activeBookId } = get()
        if (!books[id]) return
        const next = { ...books }
        delete next[id]
        const remaining = Object.keys(next)
        set({
          books: next,
          activeBookId:
            activeBookId === id ? (remaining[0] ?? '') : activeBookId,
        })
      },
      updateBook: (id, patch) => {
        const { books } = get()
        if (!books[id]) return
        set({ books: { ...books, [id]: { ...books[id], ...patch } } })
      },
    }),
    { name: 'galley.book-registry', version: 1 },
  ),
)

/**
 * Sorted list of book records — used by Settings UI to render the
 * registry in stable order (alphabetical by displayName, falling back
 * to addedAt for tie-breaking).
 */
export function useBooksSorted(): BookRecord[] {
  return useBookRegistry((s) =>
    Object.values(s.books).sort((a, b) => {
      const byName = a.displayName.localeCompare(b.displayName)
      if (byName !== 0) return byName
      return a.addedAt.localeCompare(b.addedAt)
    }),
  )
}

/**
 * Convention used by the book-server proxy and by per-book yaml
 * lookups: slugify the id input to be filesystem- and URL-safe.
 */
export function slugifyBookId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
