import { useState, useEffect, useRef } from 'react'

/**
 * Server-backed directory picker. Browses the filesystem rooted at the
 * user's $HOME via `GET /api/fs/browse?path=<absolute>`. Renders an
 * input with a "Browse…" button that opens a modal tree-walker.
 *
 * Props:
 *   value       — current absolute path string (controlled)
 *   onChange    — called with the new absolute path
 *   placeholder — input placeholder text
 *   required    — passthrough to <input>
 */
export default function DirectoryPicker({ value, onChange, placeholder, required }) {
  const [open, setOpen] = useState(false)
  const [cwd, setCwd] = useState(null)
  const [parent, setParent] = useState(null)
  const [home, setHome] = useState(null)
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const modalRef = useRef(null)

  const browse = async (targetPath) => {
    setLoading(true)
    setError('')
    try {
      const q = targetPath ? `?path=${encodeURIComponent(targetPath)}` : ''
      const r = await fetch(`/api/fs/browse${q}`)
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Failed to browse'); return }
      setCwd(data.path)
      setParent(data.parent)
      setHome(data.home)
      setEntries(data.entries)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Open the picker at the current value's directory (or home).
  const openPicker = async () => {
    setOpen(true)
    const startAt = value && value.trim() ? value.trim() : null
    await browse(startAt).catch(() => browse(null))
  }

  // Close on escape, click-outside on the backdrop.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const choose = () => {
    if (cwd) onChange(cwd)
    setOpen(false)
  }

  const enterEntry = (entry) => {
    if (!entry.isDirectory) return
    browse(`${cwd}/${entry.name}`)
  }

  return (
    <>
      <div className="dirpicker-input-row">
        <input
          className="dirpicker-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
        />
        <button
          type="button"
          className="dirpicker-browse-btn"
          onClick={openPicker}
        >Browse…</button>
      </div>

      {open && (
        <div
          className="dirpicker-backdrop"
          onClick={e => { if (e.target === modalRef.current) setOpen(false) }}
          ref={modalRef}
        >
          <div className="dirpicker-modal">
            <header className="dirpicker-header">
              <span className="dirpicker-label">Select a directory</span>
              <button
                type="button"
                className="dirpicker-close"
                onClick={() => setOpen(false)}
              >✕</button>
            </header>

            <div className="dirpicker-pathbar">
              <button
                type="button"
                className="dirpicker-nav-btn"
                disabled={!parent || loading}
                onClick={() => browse(parent)}
                title="Up one level"
              >↑</button>
              <button
                type="button"
                className="dirpicker-nav-btn"
                disabled={!home || cwd === home || loading}
                onClick={() => browse(home)}
                title="Home"
              >⌂</button>
              <code className="dirpicker-cwd">{cwd || '…'}</code>
            </div>

            {error && <div className="dirpicker-error">{error}</div>}

            <div className="dirpicker-list">
              {loading && <div className="dirpicker-loading">Loading…</div>}
              {!loading && entries.length === 0 && (
                <div className="dirpicker-empty">No subdirectories</div>
              )}
              {!loading && entries.map(entry => (
                <button
                  type="button"
                  key={entry.name}
                  className={`dirpicker-entry ${entry.isDirectory ? 'is-dir' : 'is-file'}`}
                  disabled={!entry.isDirectory}
                  onDoubleClick={() => enterEntry(entry)}
                  onClick={() => enterEntry(entry)}
                >
                  <span className="dirpicker-entry-icon">
                    {entry.isDirectory ? '📁' : '📄'}
                  </span>
                  <span className="dirpicker-entry-name">{entry.name}</span>
                </button>
              ))}
            </div>

            <footer className="dirpicker-footer">
              <button
                type="button"
                className="dirpicker-cancel"
                onClick={() => setOpen(false)}
              >Cancel</button>
              <button
                type="button"
                className="dirpicker-select"
                onClick={choose}
                disabled={!cwd}
              >Select this folder</button>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
