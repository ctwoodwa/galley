import { useState, useEffect, useRef, useCallback } from 'react'

const TYPES = [
  { key: 'edit',     label: 'Edit' },
  { key: 'flag',     label: 'Flag' },
  { key: 'note',     label: 'Note' },
  { key: 'question', label: 'Question' },
]

function getSelectionInMarkdownBody() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  // Walk up from anchor node to see if it's inside .markdown-body
  let node = range.commonAncestorContainer
  while (node && node !== document.body) {
    if (node.classList && node.classList.contains('markdown-body')) {
      return { text: sel.toString().trim(), rect: range.getBoundingClientRect() }
    }
    node = node.parentNode
  }
  return null
}

export default function CommentToolbar({ bookId, chapterId, chapterTitle, chapterSlug, onCommentAdded }) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [selectedText, setSelectedText] = useState('')
  const [activeType, setActiveType] = useState(null)
  const [inputValue, setInputValue] = useState('')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef(null)
  // True while the user is in the comment-input stage — prevents mouseup/selectionchange
  // from dismissing the toolbar when the browser clears the document selection on textarea click.
  const inputModeRef = useRef(false)

  const hide = useCallback(() => {
    inputModeRef.current = false
    setVisible(false)
    setActiveType(null)
    setInputValue('')
  }, [])

  useEffect(() => {
    const onSelectionChange = () => {
      // Don't dismiss while the user is composing a comment — clicking into
      // the textarea clears the document selection and would wipe the form.
      if (inputModeRef.current) return
      const result = getSelectionInMarkdownBody()
      if (result && result.text.length > 0) {
        const toolbarWidth = 280
        const vw = window.innerWidth
        const rawLeft = result.rect.left
        const left = Math.min(Math.max(rawLeft, 8), vw - toolbarWidth - 8)
        const top = result.rect.bottom + window.scrollY + 8
        setPosition({ top, left })
        setSelectedText(result.text)
        setVisible(true)
      } else {
        hide()
      }
    }

    // mouseup and touchend both fire when selection changes
    document.addEventListener('mouseup', onSelectionChange)
    document.addEventListener('touchend', onSelectionChange)

    // Hide on click outside (selection collapse handled by onSelectionChange)
    const onMouseDown = (e) => {
      // Allow clicks inside the toolbar itself
      const toolbar = document.getElementById('comment-toolbar')
      if (toolbar && toolbar.contains(e.target)) return
      hide()
    }
    document.addEventListener('mousedown', onMouseDown)

    return () => {
      document.removeEventListener('mouseup', onSelectionChange)
      document.removeEventListener('touchend', onSelectionChange)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [hide])

  // Focus textarea when type is selected
  useEffect(() => {
    if (activeType && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [activeType])

  const handleTypeClick = (typeKey) => {
    inputModeRef.current = true
    setActiveType(typeKey)
    setInputValue('')
  }

  const handleSave = async () => {
    if (!inputValue.trim()) return
    setSaving(true)
    try {
      const r = await fetch(`/api/books/${bookId}/review/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter_id: chapterId,
          chapter_title: chapterTitle,
          chapter_slug: chapterSlug,
          excerpt: selectedText.slice(0, 300),
          comment: inputValue.trim(),
          type: activeType,
        }),
      })
      if (!r.ok) throw new Error('Failed to save comment')
      window.getSelection()?.removeAllRanges()
      hide()
      if (onCommentAdded) onCommentAdded()
    } catch (err) {
      console.error('[CommentToolbar] save error:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setActiveType(null)
    setInputValue('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Escape') {
      handleCancel()
    }
  }

  if (!visible) return null

  return (
    <div
      id="comment-toolbar"
      className="comment-toolbar"
      style={{ top: position.top, left: position.left }}
    >
      <div className="comment-toolbar-caret" />

      {!activeType ? (
        <div className="comment-toolbar-buttons">
          {TYPES.map(t => (
            <button
              key={t.key}
              className={`cmt-btn ${t.key}`}
              onClick={() => handleTypeClick(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="cmt-input-area">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span className={`cmt-btn ${activeType}`} style={{ cursor: 'default', pointerEvents: 'none' }}>
              {TYPES.find(t => t.key === activeType)?.label}
            </span>
            {selectedText && (
              <span className="cmt-excerpt-preview">
                "{selectedText.length > 60 ? selectedText.slice(0, 60) + '…' : selectedText}"
              </span>
            )}
          </div>
          <textarea
            ref={textareaRef}
            className="cmt-textarea"
            rows={3}
            placeholder="Your comment… (⌘↵ to save)"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="cmt-actions">
            <button
              className="cmt-save-btn"
              onClick={handleSave}
              disabled={!inputValue.trim() || saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="cmt-cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
