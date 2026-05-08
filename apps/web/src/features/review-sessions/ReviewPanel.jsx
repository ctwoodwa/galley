import { useState, useEffect, useRef, useCallback } from 'react'

const PANEL_MIN = 320
const PANEL_MAX = 720
const PANEL_DEFAULT = 420
const PANEL_WIDTH_KEY = 'review-panel-width'

const TYPE_META = {
  edit:     { label: 'EDIT',     className: 'edit' },
  flag:     { label: 'FLAG',     className: 'flag' },
  note:     { label: 'NOTE',     className: 'note' },
  question: { label: 'QUESTION', className: 'question' },
}

function typeMeta(type) {
  return TYPE_META[type] || { label: type.toUpperCase(), className: 'note' }
}

function groupByChapter(comments) {
  const map = new Map()
  comments.forEach((c, idx) => {
    if (!map.has(c.chapter_id)) {
      map.set(c.chapter_id, {
        chapter_id: c.chapter_id,
        chapter_title: c.chapter_title,
        chapter_slug: c.chapter_slug,
        items: [],
      })
    }
    map.get(c.chapter_id).items.push({ ...c, _idx: idx })
  })
  return [...map.values()]
}

export default function ReviewPanel({ bookId, session, onClose, onSessionUpdate }) {
  const [submitMsg, setSubmitMsg]   = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // ── Resize ──────────────────────────────────────────────────────────────────
  const [panelWidth, setPanelWidth] = useState(
    () => parseInt(localStorage.getItem(PANEL_WIDTH_KEY) || PANEL_DEFAULT, 10)
  )
  const dragging = useRef(false)
  const startX   = useRef(0)
  const startW   = useRef(0)

  const onResizeMouseDown = useCallback(e => {
    e.preventDefault()
    dragging.current = true
    startX.current   = e.clientX
    startW.current   = panelWidth
    document.body.style.cursor     = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [panelWidth])

  useEffect(() => {
    const onMouseMove = e => {
      if (!dragging.current) return
      const delta = startX.current - e.clientX
      const next  = Math.min(PANEL_MAX, Math.max(PANEL_MIN, startW.current + delta))
      setPanelWidth(next)
    }
    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current               = false
      document.body.style.cursor     = ''
      document.body.style.userSelect = ''
      setPanelWidth(w => { localStorage.setItem(PANEL_WIDTH_KEY, w); return w })
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, [])

  // ── Data ────────────────────────────────────────────────────────────────────
  const comments     = session?.comments || []
  const commentCount = session?.comment_count ?? comments.length
  const groups       = groupByChapter(comments)

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (commentCount === 0) return
    setSubmitting(true)
    setSubmitMsg(null)
    try {
      const r    = await fetch(`/api/books/${bookId}/review/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear_after: true }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Submit failed')
      setSubmitMsg({ ok: true, file: data.file, count: data.comment_count })
      onSessionUpdate()
    } catch (err) {
      setSubmitMsg({ ok: false, error: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleClearSession = async () => {
    if (!window.confirm('Clear the entire review session? This cannot be undone.')) return
    try {
      await fetch(`/api/books/${bookId}/review/session`, { method: 'DELETE' })
      setSubmitMsg(null)
      onSessionUpdate()
    } catch {}
  }

  const handleRemoveComment = async idx => {
    try {
      await fetch(`/api/books/${bookId}/review/comment/${idx}`, { method: 'DELETE' })
      onSessionUpdate()
    } catch {}
  }

  return (
    <div className="queue-panel review-panel" style={{ width: panelWidth }}>

      {/* ── Resize handle (left edge) ──────────────────────────────────────── */}
      <div className="queue-resize-handle" onMouseDown={onResizeMouseDown} />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="queue-header">
        <span className="queue-header-title">
          Review Session
          {commentCount > 0 && (
            <span className="review-badge" style={{ marginLeft: 8 }}>{commentCount}</span>
          )}
        </span>
        <button className="queue-close-btn" onClick={onClose} title="Close">✕</button>
      </div>

      {/* ── Submit controls (fixed, never scrolls away) ────────────────────── */}
      <div className="review-submit-bar">
        <button
          className="queue-add-btn submit-pao-btn"
          onClick={handleSubmit}
          disabled={commentCount === 0 || submitting}
        >
          {submitting ? 'Submitting…' : `Submit to PAO Inbox${commentCount > 0 ? ` (${commentCount})` : ''}`}
        </button>

        {submitMsg?.ok && (
          <div className="submit-success">Written to <code>.{submitMsg.file}</code></div>
        )}
        {submitMsg && !submitMsg.ok && (
          <div className="submit-error">{submitMsg.error}</div>
        )}

        {commentCount > 0 && (
          <button className="queue-clear-btn" style={{ marginTop: 6 }} onClick={handleClearSession}>
            Clear session
          </button>
        )}
      </div>

      {/* ── Comments body (fills remaining height, scrollable) ─────────────── */}
      <div className="review-comments-body">
        {groups.length === 0 ? (
          <p className="review-empty">
            Select text in any chapter and use the toolbar to add comments. Submit the session to PAO when done.
          </p>
        ) : (
          groups.map(group => (
            <div key={group.chapter_id} className="review-chapter-group">
              <div className="review-chapter-heading">
                {group.chapter_slug} — {group.chapter_title}
              </div>
              {group.items.map(c => {
                const meta = typeMeta(c.type)
                return (
                  <div key={c._idx} className={`review-comment-item review-comment-item--${meta.className}`}>
                    <div className="review-comment-row">
                      <span className={`review-type-badge review-type-badge--${meta.className}`}>
                        {meta.label}
                      </span>
                      <div className="review-comment-body">
                        {c.excerpt && (
                          <div className="review-excerpt">
                            "{c.excerpt.length > 80 ? c.excerpt.slice(0, 80) + '…' : c.excerpt}"
                          </div>
                        )}
                        <div className="review-comment-text">{c.comment}</div>
                      </div>
                      <button
                        className="queue-remove-btn"
                        onClick={() => handleRemoveComment(c._idx)}
                        title="Remove"
                      >✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
