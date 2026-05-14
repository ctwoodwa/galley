import { useState } from 'react'
import { Trash2, Plus, Check } from 'lucide-react'
import {
  type BookRecord,
  slugifyBookId,
  useBookRegistry,
  useBooksSorted,
} from '@/api/bookRegistry'
import { SettingsSection } from '../SettingsSection'
import { TextField } from '../fields/TextField'
import { ActionField } from '../fields/ActionField'

/**
 * Books section — third reference section. Stress-tests the primitive
 * API with a registry shape (CRUD over a list of records) rather than
 * the form shape Services and Editorial use.
 *
 * Each book renders as a numbered card following the same editorial-
 * letterpress visual language as the Services slot cards. Active book
 * gets a vermilion left rule. Inline add-book form at the bottom.
 *
 * Remove uses native window.confirm() — a confirm-dialog primitive is
 * deferred until more sections need it (Danger zone will be the
 * forcing function).
 */
export function BooksSection() {
  const books = useBooksSorted()
  const activeBookId = useBookRegistry((s) => s.activeBookId)
  const setActiveBookId = useBookRegistry((s) => s.setActiveBookId)
  const updateBook = useBookRegistry((s) => s.updateBook)
  const removeBook = useBookRegistry((s) => s.removeBook)

  return (
    <SettingsSection
      title="Books"
      numeral="II"
      description="Books this galley installation knows about. Each entry points at a book repo on disk and acts as the workspace scope for editorial prefs, prose-telemetry calibration, and held-lines."
      scope="workspace"
    >
      <div>
        {books.length === 0 ? (
          <p className="gs-placeholder">
            No books registered yet. Add the first one below.
          </p>
        ) : (
          books.map((book, i) => (
            <BookCard
              key={book.id}
              numeral={String(i + 1).padStart(2, '0')}
              book={book}
              isActive={book.id === activeBookId}
              canRemove={books.length > 1}
              onSetActive={() => setActiveBookId(book.id)}
              onUpdate={(patch) => updateBook(book.id, patch)}
              onRemove={() => {
                const confirmed = window.confirm(
                  `Remove "${book.displayName}" from the registry?\n\n` +
                    `This does NOT delete the book repo on disk at:\n${book.repoPath}\n\n` +
                    `Galley will just forget about it. You can add it back any time.`,
                )
                if (confirmed) removeBook(book.id)
              }}
            />
          ))
        )}
      </div>

      <div className="gs-ornament" aria-hidden="true">
        <span className="gs-ornament-mark">❦</span>
      </div>

      <AddBookForm />
    </SettingsSection>
  )
}

interface BookCardProps {
  numeral: string
  book: BookRecord
  isActive: boolean
  canRemove: boolean
  onSetActive: () => void
  onUpdate: (patch: Partial<Omit<BookRecord, 'id' | 'addedAt'>>) => void
  onRemove: () => void
}

function BookCard({
  numeral,
  book,
  isActive,
  canRemove,
  onSetActive,
  onUpdate,
  onRemove,
}: BookCardProps) {
  return (
    <div className={'gs-book-card' + (isActive ? ' active' : '')}>
      <div className="gs-slot-numeral" aria-hidden="true">
        {numeral}
      </div>
      <div className="gs-slot-body">
        <div className="gs-slot-header">
          <span className="gs-book-name">{book.displayName || book.id}</span>
          <span className="gs-slot-provider">{book.id}</span>
        </div>
        <TextField
          label="Display name"
          value={book.displayName}
          onChange={(v) => onUpdate({ displayName: v })}
          placeholder={book.id}
          helperText="How this book appears in galley UI. Defaults to its id when blank."
        />
        <TextField
          label="Repo path on this machine"
          value={book.repoPath}
          onChange={(v) => onUpdate({ repoPath: v })}
          placeholder="~/Projects/SunfishSoftware/your-book"
          helperText="Absolute path to the book repo on this device. Per-machine — does not sync."
        />
        <div className="gs-book-actions">
          {isActive ? (
            <span className="gs-book-active-badge" aria-hidden="false">
              <Check size={13} aria-hidden="true" /> active book
            </span>
          ) : (
            <button
              type="button"
              onClick={onSetActive}
              className="gs-button vermilion"
            >
              Set as active
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            className="gs-button destructive"
            title={
              !canRemove ? "Can't remove the last book in the registry." : undefined
            }
          >
            <Trash2 size={13} aria-hidden="true" /> Remove
          </button>
        </div>
      </div>
    </div>
  )
}

function AddBookForm() {
  const addBook = useBookRegistry((s) => s.addBook)
  const setActiveBookId = useBookRegistry((s) => s.setActiveBookId)
  const [rawId, setRawId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [repoPath, setRepoPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [resultKind, setResultKind] = useState<'success' | 'error' | 'info'>('info')

  const slug = slugifyBookId(rawId)
  const helperText = slug && slug !== rawId
    ? `Will be stored as "${slug}".`
    : 'Slug-style identifier. Lowercase letters, digits, dashes.'

  const onAdd = () => {
    setError(null)
    setResultMessage(null)
    if (!slug) {
      setError('Book id is required.')
      return
    }
    if (!repoPath.trim()) {
      setError('Repo path is required.')
      return
    }
    const ok = addBook({
      id: slug,
      displayName: displayName.trim() || slug,
      repoPath: repoPath.trim(),
    })
    if (!ok) {
      setResultKind('error')
      setResultMessage(`A book with id "${slug}" is already registered.`)
      return
    }
    setActiveBookId(slug)
    setResultKind('success')
    setResultMessage(`Added "${displayName.trim() || slug}" and made it active.`)
    setRawId('')
    setDisplayName('')
    setRepoPath('')
  }

  return (
    <div className="gs-add-book">
      <p className="gs-add-book-heading">Add a book</p>
      <TextField
        label="Book id"
        value={rawId}
        onChange={(v) => {
          setRawId(v)
          setError(null)
        }}
        placeholder="my-novel"
        helperText={helperText}
        error={error?.startsWith('Book id') ? error : null}
      />
      <TextField
        label="Display name"
        value={displayName}
        onChange={setDisplayName}
        placeholder="My Novel"
        helperText="Optional. Defaults to the book id."
        showOptional
      />
      <TextField
        label="Repo path on this machine"
        value={repoPath}
        onChange={(v) => {
          setRepoPath(v)
          setError(null)
        }}
        placeholder="~/Projects/SunfishSoftware/my-novel"
        helperText="Absolute path to the book repo."
        error={error?.startsWith('Repo path') ? error : null}
      />
      <ActionField
        label="Register this book"
        description="Galley will track it locally. Adds an entry to bookRegistry; later, kernel-sync flows the per-book editorial yaml across paired devices."
        buttonLabel="Add"
        icon={<Plus size={13} />}
        onClick={onAdd}
        resultMessage={resultMessage}
        resultKind={resultKind}
        emphasis="vermilion"
      />
    </div>
  )
}
