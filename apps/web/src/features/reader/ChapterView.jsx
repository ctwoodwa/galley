import { useState, useEffect, useRef, useCallback } from 'react'
import { marked } from 'marked'
import AudioPlayer from '../audio-player/AudioPlayer.jsx'
import GeneratePanel from '../tts-voices/GeneratePanel.jsx'
import AudioMeta from '../audio-player/AudioMeta.jsx'
import CommentToolbar from '../annotations/CommentToolbar.jsx'

function stripFrontmatter(md) {
  return md.replace(/^---\n[\s\S]*?\n---\n?/, '')
}

// ── Review comment markers ─────────────────────────────────────────────────

const REVIEW_COLORS = { edit: '#3dd68c', flag: '#e8624a', note: '#5b8af5', question: '#9b7fd4' }
const REVIEW_TYPES  = ['edit', 'flag', 'note', 'question']

// Unwrap all existing highlight spans, restoring plain text nodes
function clearCommentMarkers(contentEl) {
  contentEl.querySelectorAll('.review-highlight').forEach(span => {
    const frag = document.createDocumentFragment()
    while (span.firstChild) frag.appendChild(span.firstChild)
    span.replaceWith(frag)
  })
  contentEl.normalize()
  contentEl.querySelectorAll('.review-para-mark').forEach(el => {
    el.classList.remove('review-para-mark')
    el.style.removeProperty('box-shadow')
    el.removeAttribute('title')
  })
}

// Walk offsetParent chain from el up to ancestor, summing offsetTop values.
// Requires ancestor to have position:relative so it appears in the chain.
function getTopRelative(el, ancestor) {
  let top = 0
  let cur = el
  while (cur && cur !== ancestor) {
    top += cur.offsetTop
    cur = cur.offsetParent
  }
  return top
}

// Wrap the first occurrence of `excerpt` in a highlight span within `root`.
// Falls back to a paragraph-level left-border marker if the text can't be found.
function markExcerpt(root, excerpt, type, globalIdx) {
  const needle = excerpt.toLowerCase().slice(0, 100)
  if (needle.length < 4) return false

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('.review-highlight')) continue
    const idx = node.textContent.toLowerCase().indexOf(needle)
    if (idx === -1) continue
    try {
      const mid = node.splitText(idx)
      mid.splitText(needle.length)
      const span = document.createElement('span')
      span.className = `review-highlight review-highlight--${type}`
      span.dataset.cidx = globalIdx
      mid.parentNode.insertBefore(span, mid)
      span.appendChild(mid)
      const block = span.closest('p, h1, h2, h3, h4, blockquote, li') || span.parentElement
      if (block) addParaMark(block, type)
    } catch {}
    return true
  }

  // Excerpt not found — fall back to paragraph marker only
  const fallbackNeedle = needle.slice(0, 50)
  for (const el of root.querySelectorAll('p, h1, h2, h3, h4, blockquote, li')) {
    if (el.textContent.toLowerCase().includes(fallbackNeedle)) {
      addParaMark(el, type)
      break
    }
  }
  return false
}

function addParaMark(el, type) {
  el.classList.add('review-para-mark')
  const existing = el.style.boxShadow
  const stripe = `${-(3 + (existing.split(',').filter(Boolean).length) * 4)}px 0 0 ${REVIEW_COLORS[type] || '#888'}`
  el.style.boxShadow = existing ? `${existing}, ${stripe}` : stripe
}

// commentsWithIdx must include a .globalIdx field (index in the session's comments array)
function applyCommentMarkers(contentEl, commentsWithIdx) {
  clearCommentMarkers(contentEl)
  if (!commentsWithIdx?.length) return
  for (const c of commentsWithIdx) {
    if (c.excerpt && c.excerpt.length >= 4) {
      markExcerpt(contentEl, c.excerpt.trim(), c.type, c.globalIdx)
    }
  }
}

marked.setOptions({ breaks: false, gfm: true })

// ── Text utilities ─────────────────────────────────────────────────────────

function normText(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

// Returns the best available text for chunk-to-DOM matching.
// source_text can be missing or the literal string "None" (Python serialization bug
// in regenerated alignment files) — fall back to the TTS-processed text in that case.
function chunkMatchText(chunk) {
  const st = chunk.source_text
  if (!st || st === 'None') return chunk.text || ''
  return st
}

function scoreMatch(elText, chunkText) {
  const el = normText(elText)
  const ch = normText(chunkText)
  if (!el || !ch) return 0

  const prefixLen = (a, b) => {
    const len = Math.min(a.length, b.length, 80)
    let i = 0; while (i < len && a[i] === b[i]) i++; return i
  }

  // Case 1: prefix match — chunk and element start with the same text
  const prefix = prefixLen(el, ch)
  if (prefix >= 8) return prefix

  // Case 2: per-sentence audio — chunk is a single sentence inside a larger paragraph.
  // Take the first 20 chars of the chunk and search for them within the element text.
  const chunkNeedle = ch.slice(0, 20)
  if (chunkNeedle.length >= 10) {
    const idx = el.indexOf(chunkNeedle)
    if (idx >= 0) { const sub = prefixLen(el.slice(idx), ch); if (sub >= 8) return sub }
  }

  // Case 3: element is within a larger chunk (legacy YAML-frontmatter source_text).
  // Take the first 20 chars of the element and search within the chunk text.
  const elNeedle = el.slice(0, 20)
  if (elNeedle.length >= 10) {
    const idx = ch.indexOf(elNeedle)
    if (idx > 0) { const sub = prefixLen(el, ch.slice(idx)); if (sub >= 8) return sub }
  }

  return prefix
}

function buildChunkMap(chunks, container) {
  const elements = Array.from(
    container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote')
  )
  if (!elements.length) return []

  const result = []
  let elCursor = 0

  for (const chunk of chunks) {
    if (chunk.is_pause) { result.push({ ...chunk, element: null }); continue }

    let bestEl = null, bestScore = 0, bestIdx = elCursor
    for (let i = Math.max(0, elCursor - 2); i < elements.length; i++) {
      const score = scoreMatch(elements[i].textContent, chunkMatchText(chunk))
      if (score > bestScore) { bestScore = score; bestEl = elements[i]; bestIdx = i }
      if (i > elCursor + 6) break
    }

    if (bestScore >= 8) {
      // If the element text appears mid-chunk (substring match, not prefix),
      // adjust start_seconds so the highlight doesn't fire early.
      // This handles Vol-2 chapters where the first TTS chunk includes YAML
      // frontmatter before the visible paragraph text begins.
      let start = chunk.start_seconds
      const chNorm = normText(chunkMatchText(chunk))
      const elNorm = normText(bestEl.textContent)
      const needle = elNorm.slice(0, 20)
      if (needle.length >= 10) {
        const idx = chNorm.indexOf(needle)
        if (idx > 40) { // only adjust when element is meaningfully into the chunk
          const fraction = idx / Math.max(chNorm.length, 1)
          start = chunk.start_seconds + fraction * chunk.duration_seconds
        }
      }
      result.push({ ...chunk, start_seconds: start, element: bestEl })
      elCursor = bestIdx + 1
    } else result.push({ ...chunk, element: null })
  }

  return result
}

// Split text into sentences at boundary punctuation followed by a capital
function splitSentences(text) {
  try {
    const parts = text.split(/(?<=[.!?…])\s+(?=[A-Z"'"“])/)
    return parts.filter(s => s.trim())
  } catch {
    return [text]
  }
}

// Wrap an element's content in sentence + word spans for three-layer highlighting.
// Preserves child elements (links, bold, etc.) by moving — not cloning — them.
function wrapWords(element) {
  const originalHTML = element.innerHTML
  const childNodes = Array.from(element.childNodes)
  const hasChildElements = childNodes.some(n => n.nodeType === Node.ELEMENT_NODE)

  element.innerHTML = ''

  const allWordSpans = []
  const sentenceGroups = [] // [{ el: sentenceSpan, wordSpans: [] }]

  const appendWordSpans = (container, text, target) => {
    for (const part of text.split(/(\s+)/)) {
      if (/\S/.test(part)) {
        const span = document.createElement('span')
        span.className = 'tts-word'
        span.textContent = part
        allWordSpans.push(span)
        target.push(span)
        container.appendChild(span)
      } else if (part) {
        container.appendChild(document.createTextNode(part))
      }
    }
  }

  if (hasChildElements) {
    // Mixed content — wrap only top-level text nodes, leave child elements in place
    for (const node of childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        appendWordSpans(element, node.textContent, allWordSpans)
      } else {
        element.appendChild(node)
      }
    }
  } else {
    // Pure text — split into sentences, wrap each in a sentence span
    const fullText = childNodes.map(n => n.textContent).join('')
    const sentences = splitSentences(fullText)

    if (sentences.length <= 1) {
      // Single sentence: just word spans, no sentence grouping
      appendWordSpans(element, fullText, allWordSpans)
    } else {
      sentences.forEach((sentence, sIdx) => {
        const sentEl = document.createElement('span')
        sentEl.className = 'tts-sent'
        const wordSpans = []
        appendWordSpans(sentEl, sentence, wordSpans)
        if (sIdx < sentences.length - 1) sentEl.appendChild(document.createTextNode(' '))
        sentenceGroups.push({ el: sentEl, wordSpans })
        element.appendChild(sentEl)
      })
    }
  }

  return { allWordSpans, sentenceGroups, originalHTML }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ChapterView({
  bookId, chapter, onAudioGenerated, queueActive, onAddToQueue,
  onCommentAdded, savedState, onReaderStateChange, reviewComments
}) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)
  const [audioInitialTime, setAudioInitialTime] = useState(0)

  // ── Chapter-level (overall) note form ───────────────────────────────────
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteType, setNoteType]         = useState('note')
  const [noteText, setNoteText]         = useState('')
  const [noteSaving, setNoteSaving]     = useState(false)

  // ── Margin annotations ───────────────────────────────────────────────────
  const [marginAnnotations, setMarginAnnotations] = useState([])
  const [expandedNote, setExpandedNote]           = useState(null)  // globalIdx
  const [editingNote, setEditingNote]             = useState(null)  // globalIdx
  const [editValue, setEditValue]                 = useState('')

  const audioAvailableFromTracks = chapter.tracks && chapter.tracks.length > 0
  const [audioAvailable, setAudioAvailable] = useState(chapter.has_audio || audioAvailableFromTracks)

  const [alignedChunks, setAlignedChunks] = useState(null)
  const [alignmentStale, setAlignmentStale] = useState(false)

  const chunkMapRef = useRef([])
  const activeElRef = useRef(null)
  const lastTRef = useRef(-1)
  const wordStateRef = useRef({
    element: null, allWordSpans: [], sentenceGroups: [],
    originalHTML: '', prevSentIdx: -1, prevWordSpanGroup: null, prevWordIdx: -1
  })
  const contentRef = useRef(null)
  const chapterViewRef = useRef(null)
  const playerRef = useRef(null)
  const savedScrollRef = useRef(0)
  const lastAudioSaveRef = useRef(0)
  const scrollSaveTimerRef = useRef(null)

  const save = useCallback((updates) => {
    if (onReaderStateChange) onReaderStateChange(updates)
  }, [onReaderStateChange])

  // ── Chapter load ───────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true)
    setShowGenerate(false)
    setAudioAvailable(chapter.has_audio || (chapter.tracks && chapter.tracks.length > 0))
    setAlignedChunks(null)
    setAlignmentStale(false)
    setAudioInitialTime(savedState?.audioTime || 0)
    savedScrollRef.current = savedState?.scrollTop || 0

    // Restore previous word wrapping
    const ws = wordStateRef.current
    if (ws.element && ws.originalHTML) { try { ws.element.innerHTML = ws.originalHTML } catch {} }
    wordStateRef.current = { element: null, allWordSpans: [], sentenceGroups: [], originalHTML: '', prevWordIdx: -1, prevSentIdx: -1 }
    if (activeElRef.current) { activeElRef.current.classList.remove('tts-active'); activeElRef.current = null }
    chunkMapRef.current = []
    lastTRef.current = -1

    Promise.all([
      fetch(`/api/books/${bookId}/chapters/${chapter.id}/content`).then(r => r.json()),
      fetch(`/api/books/${bookId}/chapters/${chapter.id}/alignment`).then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(([contentData, alignData]) => {
      setContent(contentData.content || '')
      setAlignedChunks(alignData?.chunks || null)
      setAlignmentStale(alignData?.stale || false)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [chapter.id]) // eslint-disable-line

  // ── Restore scroll after content renders ──────────────────────────────

  useEffect(() => {
    if (loading) return
    const scrollTo = savedScrollRef.current
    if (scrollTo > 0 && chapterViewRef.current) {
      savedScrollRef.current = 0
      requestAnimationFrame(() => {
        if (chapterViewRef.current) chapterViewRef.current.scrollTop = scrollTo
      })
    }
  }, [loading])

  // ── Scroll persistence ─────────────────────────────────────────────────

  useEffect(() => {
    const el = chapterViewRef.current
    if (!el) return
    const onScroll = () => {
      clearTimeout(scrollSaveTimerRef.current)
      scrollSaveTimerRef.current = setTimeout(() => save({ scrollTop: el.scrollTop }), 500)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); clearTimeout(scrollSaveTimerRef.current) }
  }, [save])

  // ── Review comment markers + margin annotation positions ─────────────

  useEffect(() => {
    if (loading || !contentRef.current) return
    const chapterComments = (reviewComments || [])
      .map((c, i) => ({ ...c, globalIdx: i }))
      .filter(c => c.chapter_id === chapter.id)

    applyCommentMarkers(contentRef.current, chapterComments)

    // Collect span positions after DOM has updated
    requestAnimationFrame(() => {
      if (!contentRef.current) return
      const items = []

      // Excerpt comments: read position from their highlight span
      contentRef.current.querySelectorAll('.review-highlight[data-cidx]').forEach(span => {
        const gIdx = parseInt(span.dataset.cidx, 10)
        const c = chapterComments.find(x => x.globalIdx === gIdx)
        if (!c) return
        items.push({ globalIdx: gIdx, type: c.type, comment: c.comment, excerpt: c.excerpt,
          top: getTopRelative(span, contentRef.current) })
      })

      // Overall comments (no excerpt): stack at the top
      let overallTop = 4
      chapterComments.filter(c => !c.excerpt || c.excerpt.length < 4).forEach(c => {
        items.push({ globalIdx: c.globalIdx, type: c.type, comment: c.comment, excerpt: '', top: overallTop })
        overallTop += 76
      })

      // Sort and resolve overlaps (min 72px gap when collapsed)
      items.sort((a, b) => a.top - b.top)
      for (let i = 1; i < items.length; i++) {
        if (items[i].top < items[i - 1].top + 72) items[i].top = items[i - 1].top + 72
      }
      setMarginAnnotations(items)
      // Reset any expanded/editing state for notes no longer in this chapter
      setExpandedNote(v => items.find(x => x.globalIdx === v) ? v : null)
      setEditingNote(v => items.find(x => x.globalIdx === v) ? v : null)
    })
  }, [loading, reviewComments, chapter.id])

  // ── Chapter-level note save ───────────────────────────────────────────

  const handleSaveNote = useCallback(async () => {
    if (!noteText.trim()) return
    setNoteSaving(true)
    try {
      await fetch(`/api/books/${bookId}/review/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter_id:    chapter.id,
          chapter_title: chapter.title,
          chapter_slug:  chapter.slug,
          excerpt:       '',
          comment:       noteText.trim(),
          type:          noteType,
        }),
      })
      setNoteText('')
      setShowNoteForm(false)
      if (onCommentAdded) onCommentAdded()
    } catch {}
    setNoteSaving(false)
  }, [noteText, noteType, chapter, onCommentAdded])

  // ── Margin note edit / delete ────────────────────────────────────────

  const handleDeleteNote = useCallback(async (globalIdx) => {
    try {
      await fetch(`/api/books/${bookId}/review/comment/${globalIdx}`, { method: 'DELETE' })
      if (onCommentAdded) onCommentAdded()
    } catch {}
  }, [onCommentAdded])

  const handleSaveEditNote = useCallback(async (globalIdx) => {
    if (!editValue.trim()) return
    try {
      const r = await fetch(`/api/books/${bookId}/review/comment/${globalIdx}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: editValue.trim() }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setEditingNote(null)
      setEditValue('')
      if (onCommentAdded) onCommentAdded()
    } catch (err) {
      console.error('[ChapterView] save note error:', err)
    }
  }, [editValue, onCommentAdded])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────

  useEffect(() => {
    const INTERACTIVE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
    const onKey = (e) => {
      if (INTERACTIVE.has(e.target.tagName) || e.target.isContentEditable) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      switch (e.key) {
        case ' ':
          e.preventDefault()
          playerRef.current?.togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          playerRef.current?.seek(e.shiftKey ? -30 : -10)
          break
        case 'ArrowRight':
          e.preventDefault()
          playerRef.current?.seek(e.shiftKey ? 30 : 10)
          break
        case 'ArrowUp':
          if (!INTERACTIVE.has(document.activeElement?.tagName)) {
            e.preventDefault()
            playerRef.current?.changeVolume(0.1)
          }
          break
        case 'ArrowDown':
          if (!INTERACTIVE.has(document.activeElement?.tagName)) {
            e.preventDefault()
            playerRef.current?.changeVolume(-0.1)
          }
          break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ── Chunk map ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!alignedChunks || !contentRef.current || loading) return
    chunkMapRef.current = buildChunkMap(alignedChunks, contentRef.current)
  }, [alignedChunks, content, loading])

  // ── Time update — three-layer highlight ───────────────────────────────

  const scrollToActive = useCallback((el, instant) => {
    if (!el || !chapterViewRef.current) return
    if (instant) {
      // Manual scroll accounting for sticky bar height
      const container = chapterViewRef.current
      const stickyBar = container.querySelector('.sticky-player-bar')
      const barH = stickyBar ? stickyBar.offsetHeight : 60
      const elTop = el.offsetTop - container.offsetTop
      const target = elTop - barH - 24
      container.scrollTop = Math.max(0, target)
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [])

  const handleTimeUpdate = useCallback((t) => {
    // Throttled audio time save
    const now = Date.now()
    if (now - lastAudioSaveRef.current > 5000) {
      save({ audioTime: t }); lastAudioSaveRef.current = now
    }

    const map = chunkMapRef.current
    if (!map.length) return

    // Detect user seek: delta > 1.5s from last tick
    const isSeeked = lastTRef.current >= 0 && Math.abs(t - lastTRef.current) > 1.5
    lastTRef.current = t

    let activeChunk = null
    for (const entry of map) {
      if (!entry.element) continue
      if (t >= entry.start_seconds && t < entry.end_seconds) { activeChunk = entry; break }
    }

    const active = activeChunk?.element || null

    // On seek to the same element: force rewrap + scroll to clear stale word state
    const forcedTransition = isSeeked && active !== null && active === activeElRef.current

    // Layer 1 — paragraph
    if (active !== activeElRef.current || forcedTransition) {
      if (activeElRef.current) {
        activeElRef.current.classList.remove('tts-active')
        const ws = wordStateRef.current
        if (ws.element === activeElRef.current && ws.originalHTML) {
          activeElRef.current.innerHTML = ws.originalHTML
        }
        wordStateRef.current = { element: null, allWordSpans: [], sentenceGroups: [], originalHTML: '', prevSentIdx: -1, prevWordSpanGroup: null, prevWordIdx: -1 }
      }

      if (active) {
        active.classList.add('tts-active')
        const wrapped = wrapWords(active)
        wordStateRef.current = { element: active, ...wrapped, prevSentIdx: -1, prevWordSpanGroup: null, prevWordIdx: -1 }
        scrollToActive(active, isSeeked)
      }

      activeElRef.current = active
    }

    if (!activeChunk || !active) return

    const ws = wordStateRef.current
    const elapsed = t - activeChunk.start_seconds
    const duration = activeChunk.duration_seconds || 1
    const progress = Math.min(elapsed / duration, 0.999)

    // Layer 2 — sentence: match this chunk's text to the correct sentence span.
    // For per-sentence audio, each chunk IS one sentence — scoreMatch finds it
    // precisely. For whole-paragraph chunks, sentence[0] wins on prefix score.
    if (ws.sentenceGroups.length >= 1) {
      let sentIdx = 0
      if (ws.sentenceGroups.length > 1) {
        let best = -1
        ws.sentenceGroups.forEach(({ el }, i) => {
          const sc = scoreMatch(el.textContent, activeChunk.text)
          if (sc > best) { best = sc; sentIdx = i }
        })
      }

      if (sentIdx !== ws.prevSentIdx) {
        if (ws.prevSentIdx >= 0) ws.sentenceGroups[ws.prevSentIdx]?.el.classList.remove('tts-sent-active')
        ws.sentenceGroups[sentIdx]?.el.classList.add('tts-sent-active')
        // Sentence changed — clear word highlight from the previous sentence's spans
        if (ws.prevWordIdx >= 0 && ws.prevWordSpanGroup) {
          ws.prevWordSpanGroup[ws.prevWordIdx]?.classList.remove('tts-word-active')
          ws.prevWordIdx = -1
        }
        ws.prevSentIdx = sentIdx
        ws.prevWordSpanGroup = ws.sentenceGroups[sentIdx]?.wordSpans || null
      }
    }

    // Layer 3 — word: interpolate within the current sentence's spans only,
    // so the highlight advances through one sentence at a time rather than
    // looping across the entire paragraph on every chunk.
    const wordSpans = ws.prevWordSpanGroup ?? ws.allWordSpans
    if (wordSpans.length > 0) {
      const wordIdx = Math.min(Math.floor(progress * wordSpans.length), wordSpans.length - 1)
      if (wordIdx !== ws.prevWordIdx) {
        if (ws.prevWordIdx >= 0) wordSpans[ws.prevWordIdx]?.classList.remove('tts-word-active')
        wordSpans[wordIdx]?.classList.add('tts-word-active')
        ws.prevWordIdx = wordIdx
      }
    }
  }, [save, scrollToActive])

  const handleGenerated = () => {
    setAudioAvailable(true)
    setShowGenerate(false)
    if (onAudioGenerated) onAudioGenerated()
  }

  const html = loading ? '' : marked.parse(stripFrontmatter(content))

  return (
    <div className="chapter-view" ref={chapterViewRef}>
      <div className="chapter-header">
        <div className="chapter-meta">
          <span className="chapter-volume">{chapter.volume === 'vol-1' ? 'Volume 1' : 'Volume 2'}</span>
          <span className="chapter-section-label">{chapter.section_label}</span>
          <button
            className={`chapter-note-btn${showNoteForm ? ' active' : ''}`}
            onClick={() => setShowNoteForm(v => !v)}
            title="Add overall chapter note"
          >
            + Note
          </button>
        </div>
        <h1 className="chapter-title">{chapter.title}</h1>

        {showNoteForm && (
          <div className="chapter-note-form">
            <div className="chapter-note-type-row">
              {REVIEW_TYPES.map(t => (
                <button
                  key={t}
                  className={`cmt-btn ${t}${noteType === t ? ' selected' : ''}`}
                  onClick={() => setNoteType(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <textarea
              className="cmt-textarea chapter-note-textarea"
              rows={3}
              placeholder="Overall chapter note… (⌘↵ to save)"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSaveNote() }
                if (e.key === 'Escape') setShowNoteForm(false)
              }}
              autoFocus
            />
            <div className="cmt-actions">
              <button className="cmt-save-btn" onClick={handleSaveNote} disabled={!noteText.trim() || noteSaving}>
                {noteSaving ? 'Saving…' : 'Save note'}
              </button>
              <button className="cmt-cancel-btn" onClick={() => { setShowNoteForm(false); setNoteText('') }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky player bar — always visible ──────────────────────────── */}
      <div className="sticky-player-bar">
        {audioAvailable ? (
          <div className="audio-player-row">
            <AudioPlayer
              ref={playerRef}
              bookId={bookId}
              chapter={chapter}
              tracks={chapter.tracks || []}
              onTimeUpdate={handleTimeUpdate}
              initialTime={audioInitialTime}
            />
            <div className="audio-actions">
              <button className="regen-btn" onClick={() => setShowGenerate(v => !v)} title="Regenerate audio">
                {showGenerate ? '✕ Cancel' : '↺ Regenerate'}
              </button>
              <button
                className="regen-btn queue-add-inline-btn"
                onClick={() => onAddToQueue && onAddToQueue(chapter.id)}
                title="Add to render queue"
              >
                + Queue
              </button>
            </div>
          </div>
        ) : (
          <div className="no-audio-bar">
            <span className="no-audio-label">No audio</span>
            <button className="regen-btn" onClick={() => setShowGenerate(v => !v)}>
              {showGenerate ? '✕ Cancel' : '⊕ Generate'}
            </button>
            <button className="regen-btn" onClick={() => onAddToQueue && onAddToQueue(chapter.id)}>
              + Queue
            </button>
          </div>
        )}
        <div className="player-shortcuts">
          <span><kbd>Space</kbd> play/pause</span>
          <span><kbd>←</kbd><kbd>→</kbd> ±10s</span>
          <span><kbd>Shift</kbd>+<kbd>←→</kbd> ±30s</span>
          <span><kbd>↑</kbd><kbd>↓</kbd> volume</span>
          {alignmentStale && (
            <span className="align-stale-warn" title="Audio was regenerated after alignment was built — re-run audiobook.py --force to fix sync">
              ⚠ sync stale — re-render to fix
            </span>
          )}
        </div>
      </div>

      {/* ── Audio metadata + generate panel (scrolls normally) ─────────── */}
      <div className="audio-detail-section">
        {audioAvailable && <AudioMeta info={chapter.audio_info} />}
        {!audioAvailable && chapter.planned_preset && <AudioMeta planned={chapter.planned_preset} />}
        {!audioAvailable && (
          <div className="audio-missing-actions">
            <button className="gen-button secondary" onClick={() => onAddToQueue && onAddToQueue(chapter.id)}>
              + Queue
            </button>
          </div>
        )}
        {showGenerate && <GeneratePanel bookId={bookId} chapter={chapter} onGenerated={handleGenerated} />}
      </div>

      {/* ── Chapter body ─────────────────────────────────────────────────── */}
      <div className="chapter-content">
        {loading ? (
          <div className="content-loading">Loading…</div>
        ) : (
          <div className="review-margin-host">
            <div
              ref={contentRef}
              className={`markdown-body${alignedChunks ? ' has-alignment' : ''}`}
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <div className="review-margin">
              {marginAnnotations.map(a => {
                const isExpanded = expandedNote === a.globalIdx
                const isEditing  = editingNote  === a.globalIdx
                return (
                  <div
                    key={a.globalIdx}
                    className={`review-margin-note review-margin-note--${a.type}${isExpanded ? ' expanded' : ''}`}
                    style={{ top: a.top }}
                    onClick={() => !isEditing && setExpandedNote(v => v === a.globalIdx ? null : a.globalIdx)}
                  >
                    {isEditing ? (
                      <div onClick={e => e.stopPropagation()}>
                        <textarea
                          className="review-margin-edit-input"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveEditNote(a.globalIdx)
                            if (e.key === 'Escape') { setEditingNote(null); setEditValue('') }
                          }}
                          autoFocus
                        />
                        <div className="review-margin-actions">
                          <button className="review-margin-save" onClick={() => handleSaveEditNote(a.globalIdx)}>Save</button>
                          <button className="review-margin-cancel" onClick={() => { setEditingNote(null); setEditValue('') }}>Cancel</button>
                        </div>
                      </div>
                    ) : isExpanded ? (
                      <>
                        <div className="review-margin-label">{a.type.toUpperCase()}</div>
                        {a.excerpt && (
                          <div className="review-margin-excerpt">
                            "{a.excerpt.length > 55 ? a.excerpt.slice(0, 55) + '…' : a.excerpt}"
                          </div>
                        )}
                        <div className="review-margin-text">{a.comment}</div>
                        <div className="review-margin-actions" onClick={e => e.stopPropagation()}>
                          <button className="review-margin-edit-btn" onClick={() => { setEditingNote(a.globalIdx); setEditValue(a.comment) }}>Edit</button>
                          <button className="review-margin-del-btn" onClick={() => handleDeleteNote(a.globalIdx)}>Delete</button>
                        </div>
                      </>
                    ) : (
                      <div className="review-margin-pill">
                        <span className="review-margin-pill-type">{a.type[0].toUpperCase()}</span>
                        <span className="review-margin-pill-text">
                          {a.comment.length > 40 ? a.comment.slice(0, 40) + '…' : a.comment}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <CommentToolbar
        bookId={bookId}
        chapterId={chapter.id}
        chapterTitle={chapter.title}
        chapterSlug={chapter.slug}
        onCommentAdded={onCommentAdded}
      />
    </div>
  )
}
