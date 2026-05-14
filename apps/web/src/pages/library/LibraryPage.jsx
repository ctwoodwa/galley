import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import DirectoryPicker from '../../components/DirectoryPicker.jsx'

export default function LibraryPage() {
  const navigate = useNavigate()
  const [books, setBooks]     = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)
  const [form, setForm]       = useState({ id: '', title: '', bookRoot: '', audioRoot: '' })
  const [error, setError]     = useState('')
  const [discovery, setDiscovery] = useState(null)  // {audioRoot, matched, chapter_count, volumes}

  useEffect(() => {
    fetch('/api/books')
      .then(r => r.json())
      .then(data => { setBooks(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleAdd = async e => {
    e.preventDefault()
    setError('')
    try {
      const r = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Failed to add book'); return }
      setBooks(prev => [...prev, data])
      setAdding(false)
      setForm({ id: '', title: '', bookRoot: '', audioRoot: '' })
      setDiscovery(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRemove = async (bookId) => {
    if (!confirm(`Remove "${books.find(b => b.id === bookId)?.title}" from the library?`)) return
    try {
      await fetch(`/api/books/${bookId}`, { method: 'DELETE' })
      setBooks(prev => prev.filter(b => b.id !== bookId))
    } catch {}
  }

  const deriveId = (title) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  // Probe the backend for chapter count + audio-root candidate whenever the
  // chosen bookRoot changes. Debounced via the useEffect's cleanup function.
  useEffect(() => {
    if (!form.bookRoot || !form.bookRoot.startsWith('/')) {
      setDiscovery(null)
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/books/discover-audio-root', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookRoot: form.bookRoot }),
        })
        const data = await r.json()
        if (cancelled) return
        if (!r.ok) { setDiscovery(null); return }
        setDiscovery(data)
        // If the user hasn't typed their own audioRoot, pre-fill with discovered.
        if (data.audioRoot && !form.audioRoot) {
          setForm(f => f.audioRoot ? f : { ...f, audioRoot: data.audioRoot })
        }
      } catch {
        if (!cancelled) setDiscovery(null)
      }
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.bookRoot])

  return (
    <div className="library-page">
      <header className="library-header">
        <h1 className="library-title">Galley</h1>
        <p className="library-subtitle">Editorial book library</p>
        <p className="library-subtitle" style={{ marginTop: 8 }}>
          <Link to="/inference" style={{ color: 'var(--accent)' }}>
            → Inference Studio (raw API exploration)
          </Link>
        </p>
      </header>

      {loading ? (
        <div className="library-empty">Loading…</div>
      ) : (
        <div className="library-grid">
          {books.map(book => (
            <div
              key={book.id}
              className="library-card"
              onClick={() => navigate(`/read/${book.id}`)}
            >
              <div className="library-card-title">{book.title}</div>
              <div className="library-card-meta">
                {book.chapter_count} chapter{book.chapter_count !== 1 ? 's' : ''}
                {book.volumes?.length > 0 && (
                  <span className="library-card-vols">
                    {' · '}{book.volumes.map(v => v.label).join(', ')}
                  </span>
                )}
              </div>
              <div className="library-card-path">{book.bookRoot}</div>
              <button
                className="library-card-remove"
                onClick={e => { e.stopPropagation(); handleRemove(book.id) }}
              >Remove</button>
            </div>
          ))}

          {!adding && (
            <button className="library-add-btn" onClick={() => setAdding(true)}>
              + Add Book
            </button>
          )}
        </div>
      )}

      {adding && (
        <div className="library-add-form-wrap">
          <form className="library-add-form" onSubmit={handleAdd}>
            <h2 className="library-form-title">Add Book</h2>
            {error && <div className="library-form-error">{error}</div>}
            <label>
              Title
              <input
                value={form.title}
                onChange={e => {
                  const title = e.target.value
                  setForm(f => ({ ...f, title, id: f.id || deriveId(title) }))
                }}
                placeholder="The Inverted Stack"
                required
              />
            </label>
            <label>
              ID <span className="library-form-hint">(url-safe, e.g. my-book)</span>
              <input
                value={form.id}
                onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                placeholder="my-book"
                pattern="[a-z0-9-]+"
                required
              />
            </label>
            <label>
              Book root path
              <DirectoryPicker
                value={form.bookRoot}
                onChange={(p) => setForm(f => ({ ...f, bookRoot: p }))}
                placeholder="/Users/you/Projects/my-book"
                required
              />
            </label>
            {discovery && discovery.chapter_count > 0 && (
              <div className="library-form-discovery">
                <div>
                  Detected <strong>{discovery.chapter_count}</strong> chapter{discovery.chapter_count !== 1 ? 's' : ''}
                  {discovery.volumes?.length > 0 && (
                    <span> in {discovery.volumes.join(', ')}</span>
                  )}
                </div>
                {discovery.audioRoot ? (
                  <div className="library-form-discovery-audio">
                    Found existing audio: <code>{discovery.audioRoot}</code>
                    {' '}({discovery.matched} matching mp3{discovery.matched !== 1 ? 's' : ''})
                  </div>
                ) : (
                  <div className="library-form-discovery-audio library-form-discovery-empty">
                    No existing audio found — new audio will render to Galley's default location.
                  </div>
                )}
              </div>
            )}
            <label>
              Audio root path <span className="library-form-hint">(optional; auto-detected or leave blank for default)</span>
              <DirectoryPicker
                value={form.audioRoot}
                onChange={(p) => setForm(f => ({ ...f, audioRoot: p }))}
                placeholder={discovery?.audioRoot || 'Galley default location'}
              />
            </label>
            <div className="library-form-actions">
              <button type="submit" className="library-form-submit">Add</button>
              <button type="button" className="library-form-cancel" onClick={() => { setAdding(false); setError(''); setDiscovery(null) }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
