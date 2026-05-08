import { useState, useEffect, useRef, useCallback } from 'react'
import { marked } from 'marked'
import AudioPlayer from '../audio-player/AudioPlayer.jsx'
import SentenceNavBar from './SentenceNavBar.jsx'
import GeneratePanel from '../tts/GeneratePanel.jsx'
import AudioMeta from '../audio-player/AudioMeta.jsx'
import CommentToolbar from '../annotations/CommentToolbar.jsx'
import { useVoiceTemplates } from '@/lib/useVoiceTemplates'
import { templateToRenderConfig } from '@/lib/voice-templates'
import { useApiConfig } from '@/api/config'
import { playStaleChime, isChimeEnabled, setChimeEnabled } from '@/lib/chime'
import { useDictation } from '@/hooks/useDictation'

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
  bookId, chapter, onAudioGenerated, queueActive, onAddToQueue, queue,
  onCommentAdded, savedState, onReaderStateChange, reviewComments
}) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)
  const [audioInitialTime, setAudioInitialTime] = useState(0)
  // Phase D: splash dialog when re-opening a chapter mid-listen.
  // Three options: Resume from saved sentence · From start · Just browse.
  const [splashOpen, setSplashOpen] = useState(false)
  const [splashSentence, setSplashSentence] = useState(null) // { idx, total, text, t }
  // Phase E: inline sentence edit. {chunk_id, original_text, draft_text}|null
  const [sentenceEdit, setSentenceEdit] = useState(null)
  // Phase E: chunk_ids that have pending edits — drives the amber margin dot.
  const [staleChunkIds, setStaleChunkIds] = useState(new Set())
  const [pendingEditCount, setPendingEditCount] = useState(0)
  const [committingEdits, setCommittingEdits] = useState(false)
  // Phase F: chime when audio crosses a stale chunk. Stored in localStorage
  // (galley.reader.chime-enabled). Set tracks chunks that have already
  // chimed in this session so we don't re-fire on every poll tick.
  const [chimeEnabled, setChimeEnabledState] = useState(() => isChimeEnabled())
  const chimedChunksRef = useRef(new Set())
  const lastActiveChunkIdRef = useRef(null)
  const toggleChime = useCallback(() => {
    setChimeEnabledState((on) => { setChimeEnabled(!on); return !on })
  }, [])
  // When stale set shrinks (commit applied), drop chimed entries that are
  // no longer stale so re-staling them later (re-edit) chimes again.
  useEffect(() => {
    const remaining = new Set()
    for (const id of chimedChunksRef.current) {
      if (staleChunkIds.has(id)) remaining.add(id)
    }
    chimedChunksRef.current = remaining
  }, [staleChunkIds])

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

    // Reset splash on chapter switch — only opens if there's a saved
    // mid-listen position (audioTime > 30s) that we can offer to resume.
    setSplashOpen(false)
    setSplashSentence(null)

    Promise.all([
      fetch(`/api/books/${bookId}/chapters/${chapter.id}/content`).then(r => r.json()),
      fetch(`/api/books/${bookId}/chapters/${chapter.id}/alignment`).then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(([contentData, alignData]) => {
      setContent(contentData.content || '')
      setAlignedChunks(alignData?.chunks || null)
      setAlignmentStale(alignData?.stale || false)
      setLoading(false)
      // Phase E: load pending sentence edits to drive stale margin dots.
      fetch(`/api/books/${bookId}/chapters/${chapter.id}/sentence-edits`)
        .then(r => r.ok ? r.json() : [])
        .then(edits => {
          setStaleChunkIds(new Set(edits.map(e => e.chunk_id)))
          setPendingEditCount(edits.length)
        })
        .catch(() => { setStaleChunkIds(new Set()); setPendingEditCount(0) })

      // Phase D splash decision — only open if we have a meaningful saved
      // position (>30s into the chapter) AND alignment data so we can map
      // the time → sentence-N for the resume label. Otherwise just behave
      // as before (auto-seek to saved time when audio loads).
      const t = savedState?.audioTime || 0
      if (t > 30 && alignData?.chunks?.length) {
        let idx = -1
        for (let i = 0; i < alignData.chunks.length; i++) {
          const c = alignData.chunks[i]
          if (t >= c.start_seconds && t < c.end_seconds) { idx = i; break }
        }
        if (idx < 0) idx = alignData.chunks.length - 1
        const cur = alignData.chunks[idx]
        const sentenceIdx = alignData.chunks.slice(0, idx + 1).filter((c) => !c.is_pause).length
        const totalSentences = alignData.chunks.filter((c) => !c.is_pause).length
        setSplashSentence({
          idx: sentenceIdx,
          total: totalSentences,
          text: (cur.source_text || cur.text || '').trim().slice(0, 120),
          t,
        })
        setSplashOpen(true)
      }
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

  // Keyboard handler is bound after the seek + repeat + bookmark callbacks
  // are declared (further down in this function). We use a ref-based
  // late-binding trick so this useEffect can stay near the other reader
  // setup effects: keyHandlersRef is initialised empty, then populated by a
  // second effect that runs AFTER the callbacks exist.
  const keyHandlersRef = useRef({})

  useEffect(() => {
    const INTERACTIVE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
    const onKey = (e) => {
      if (INTERACTIVE.has(e.target.tagName) || e.target.isContentEditable) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const h = keyHandlersRef.current
      switch (e.key) {
        case ' ':
          e.preventDefault()
          playerRef.current?.togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (h.alignedChunks && h.seekRelativeSentence) {
            // sentence-aware: ← = -1 sentence; Shift+← = -1 paragraph
            if (e.shiftKey) h.seekRelativeParagraph?.(-1)
            else h.seekRelativeSentence(-1)
          } else {
            // No alignment data — fall back to time-based skip.
            playerRef.current?.seek(e.shiftKey ? -30 : -10)
          }
          break
        case 'ArrowRight':
          e.preventDefault()
          if (h.alignedChunks && h.seekRelativeSentence) {
            if (e.shiftKey) h.seekRelativeParagraph?.(1)
            else h.seekRelativeSentence(1)
          } else {
            playerRef.current?.seek(e.shiftKey ? 30 : 10)
          }
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
        case 'r':
        case 'R':
          if (h.alignedChunks && h.repeatCurrentSentence) {
            e.preventDefault()
            h.repeatCurrentSentence()
          }
          break
        case 'b':
        case 'B':
          if (h.alignedChunks && h.markForReview) {
            e.preventDefault()
            h.markForReview()
          }
          break
        case 'd':
        case 'D':
          if (h.alignedChunks && h.dict) {
            e.preventDefault()
            if (h.dict.isRecording) h.dict.stop()
            else if (h.dict.isIdle) h.startDictationOnCurrentChunk?.()
            // ignore while transcribing (in flight)
          }
          break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ── Chunk map + sentence-click data attributes ────────────────────────

  useEffect(() => {
    if (!alignedChunks || !contentRef.current || loading) return
    const map = buildChunkMap(alignedChunks, contentRef.current)
    chunkMapRef.current = map

    // Phase B: annotate mapped elements with data attrs so click-to-localize
    // works without a separate index. data-chunk-ids holds a comma-joined
    // list because multiple chunks may map to the same paragraph element.
    const byEl = new Map()
    for (const entry of map) {
      if (!entry.element) continue
      const existing = byEl.get(entry.element) || { ids: [], starts: [] }
      existing.ids.push(entry.chunk_id)
      existing.starts.push(entry.start_seconds)
      byEl.set(entry.element, existing)
    }
    for (const [el, info] of byEl.entries()) {
      el.dataset.chunkIds = info.ids.join(',')
      el.dataset.firstChunkStart = String(info.starts[0])
      // Phase E: amber dot when any chunk in this paragraph has a pending edit.
      const hasStale = info.ids.some(id => staleChunkIds.has(id))
      el.classList.toggle('has-pending-edit', hasStale)
    }
  }, [alignedChunks, content, loading, staleChunkIds])

  // ── Phase D: splash handlers ──────────────────────────────────────────

  const splashResume = useCallback(() => {
    setSplashOpen(false)
    // The audio element already has initialTime set; just trigger play.
    const audio = playerRef.current?.audio?.()
    if (audio) void audio.play().catch(() => {})
  }, [])

  const splashFromStart = useCallback(() => {
    setSplashOpen(false)
    setAudioInitialTime(0)
    const audio = playerRef.current?.audio?.()
    if (audio) {
      audio.currentTime = 0
      void audio.play().catch(() => {})
    }
  }, [])

  const splashBrowse = useCallback(() => {
    // Just close splash — audio stays paused at saved position so user can
    // navigate sentences with click/←→ without auto-playing.
    setSplashOpen(false)
  }, [])

  // ── Phase D: repeat-current-sentence + bookmark ───────────────────────

  // Brief on-screen confirmation toast (used by B = bookmark + R = repeat).
  const [phaseDToast, setPhaseDToast] = useState(null)
  const phaseDToastTimerRef = useRef(null)
  const showPhaseDToast = useCallback((message) => {
    setPhaseDToast(message)
    clearTimeout(phaseDToastTimerRef.current)
    phaseDToastTimerRef.current = setTimeout(() => setPhaseDToast(null), 1800)
  }, [])
  useEffect(() => () => clearTimeout(phaseDToastTimerRef.current), [])

  // ── Phase C: sentence-aware seek helpers ──────────────────────────────

  const findCurrentChunkIdx = useCallback(() => {
    const map = chunkMapRef.current
    if (!map.length) return -1
    const audio = playerRef.current?.audio?.()
    if (!audio) return -1
    const t = audio.currentTime
    for (let i = 0; i < map.length; i++) {
      if (t >= map[i].start_seconds && t < map[i].end_seconds) return i
    }
    // Past end — return last
    return map.length - 1
  }, [])

  const seekRelativeSentence = useCallback((delta) => {
    const map = chunkMapRef.current
    if (!map.length) return
    const audio = playerRef.current?.audio?.()
    if (!audio) return
    let idx = findCurrentChunkIdx()
    if (idx < 0) return
    // Step delta sentences, skipping pauses (which are silent and not
    // user-meaningful as a navigation target).
    const step = delta > 0 ? 1 : -1
    let remaining = Math.abs(delta)
    while (remaining > 0) {
      idx += step
      if (idx < 0 || idx >= map.length) break
      if (!map[idx].is_pause) remaining -= 1
    }
    if (idx < 0) idx = 0
    if (idx >= map.length) idx = map.length - 1
    audio.currentTime = map[idx].start_seconds
  }, [findCurrentChunkIdx])

  // R = repeat current sentence (seek to start of current chunk and play).
  // If the current chunk is already at its start (within 0.5s), step back one
  // non-pause chunk first — supports tapping R repeatedly to scrub back.
  const repeatCurrentSentence = useCallback(() => {
    const map = chunkMapRef.current
    if (!map.length) return
    const audio = playerRef.current?.audio?.()
    if (!audio) return
    let idx = findCurrentChunkIdx()
    if (idx < 0) return
    const cur = map[idx]
    const atStart = audio.currentTime - cur.start_seconds < 0.5
    if (atStart) {
      // Step back to previous non-pause chunk.
      let prev = idx - 1
      while (prev >= 0 && map[prev].is_pause) prev -= 1
      if (prev >= 0) idx = prev
    }
    audio.currentTime = map[idx].start_seconds
    if (audio.paused) void audio.play().catch(() => {})
  }, [findCurrentChunkIdx])

  // B = mark for review — POST a "note" comment on the current sentence with
  // a bookmark default body. Uses the existing /api/books/:bookId/review/comment
  // surface so the bookmark shows up in the Review panel; user can later edit
  // the text or change the type. Per the audio-editor spec: flags are
  // short-bodied comments under the hood.
  const markForReview = useCallback(async () => {
    const map = chunkMapRef.current
    if (!map.length) {
      showPhaseDToast('No alignment yet — open a chapter with audio')
      return
    }
    const idx = findCurrentChunkIdx()
    if (idx < 0) return
    const cur = map[idx]
    const excerpt = (cur.source_text || cur.text || '').trim()
    try {
      const r = await fetch(`/api/books/${bookId}/review/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter_id: chapter.id,
          chapter_title: chapter.title,
          chapter_slug: chapter.slug,
          excerpt: excerpt.slice(0, 300),
          comment: '🔖 Bookmark — review this',
          type: 'note',
        }),
      })
      if (!r.ok) throw new Error('Failed to bookmark')
      showPhaseDToast(`🔖 Bookmarked sentence ${idx + 1}`)
      if (onCommentAdded) onCommentAdded()
    } catch (err) {
      showPhaseDToast(`Bookmark failed: ${err.message}`)
    }
  }, [bookId, chapter.id, chapter.title, chapter.slug, findCurrentChunkIdx, onCommentAdded, showPhaseDToast])

  const seekRelativeParagraph = useCallback((delta) => {
    const map = chunkMapRef.current
    if (!map.length) return
    const audio = playerRef.current?.audio?.()
    if (!audio) return
    const idx = findCurrentChunkIdx()
    if (idx < 0) return
    const currentEl = map[idx].element
    const step = delta > 0 ? 1 : -1
    // Walk until we cross a paragraph boundary (different .element) delta times.
    let crossings = 0
    let target = idx
    let lastEl = currentEl
    for (let i = idx + step; i >= 0 && i < map.length; i += step) {
      if (map[i].element && map[i].element !== lastEl) {
        crossings += 1
        lastEl = map[i].element
        target = i
        if (crossings >= Math.abs(delta)) break
      }
    }
    audio.currentTime = map[target].start_seconds
  }, [findCurrentChunkIdx])

  // Late-bind keyboard-handler ref so the useEffect above (which only sees
  // an empty ref initially) can call into these callbacks without TDZ.
  // Excludes `dict` and `startDictationOnCurrentChunk` — those consts are
  // declared further down in source order; the second assignment below
  // (after their declarations) is what wires them.
  keyHandlersRef.current = {
    alignedChunks,
    seekRelativeSentence,
    seekRelativeParagraph,
    repeatCurrentSentence,
    markForReview,
  }

  // ── Phase E: open inline edit on Alt+click of a sentence ──────────────

  const openSentenceEdit = useCallback((chunkId, originalText) => {
    setSentenceEdit({ chunk_id: chunkId, original_text: originalText, draft_text: originalText })
    // Pause audio while the editor is open — focus pauses listening.
    const audio = playerRef.current?.audio?.()
    if (audio && !audio.paused) audio.pause()
  }, [])

  const cancelSentenceEdit = useCallback(() => setSentenceEdit(null), [])

  const commitSentenceEdit = useCallback(async (tier = 'quality') => {
    const edit = sentenceEdit
    if (!edit) return
    const trimmed = (edit.draft_text || '').trim()
    if (!trimmed || trimmed === edit.original_text.trim()) {
      // No-op — nothing to commit.
      setSentenceEdit(null)
      return
    }
    try {
      const r = await fetch(`/api/books/${bookId}/chapters/${chapter.id}/sentence-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunk_id: edit.chunk_id,
          new_text: trimmed,
          prev_text: edit.original_text,
          tier,
        }),
      })
      if (!r.ok) throw new Error('Failed to save edit')
      setStaleChunkIds(prev => new Set(prev).add(edit.chunk_id))
      setPendingEditCount(c => c + 1)
      setSentenceEdit(null)
      showPhaseDToast(`✎ Edit queued — click "Commit edits" to apply + re-render`)
    } catch (err) {
      showPhaseDToast(`Edit failed: ${err.message}`)
    }
  }, [sentenceEdit, bookId, chapter.id, showPhaseDToast])

  // ── Phase E commit (Option A): apply pending edits to source.md and
  // trigger a chapter regen. Backend rotates the journal to applied-edits/
  // for audit; we resync local state from the response.
  const { forTier } = useVoiceTemplates()
  const apiKey = useApiConfig((s) => s.apiKey)
  // mode='render-now' → apply edits + spawn audiobook.py inline
  // mode='queue'      → apply edits + stage chapter for batch render
  const commitPendingEdits = useCallback(async (mode = 'render-now', tier = 'quality') => {
    if (committingEdits || pendingEditCount === 0) return
    setCommittingEdits(true)
    const template = forTier(tier)
    const cfg = templateToRenderConfig(template)
    const needsKey = cfg.engine === 'chatterbox' || cfg.engine === 'kokoro'
    if (needsKey && !apiKey) {
      showPhaseDToast('No API key — open ⚙ → Inference API Settings')
      setCommittingEdits(false)
      return
    }
    const opts = { ...cfg, ...(needsKey && apiKey ? { api_key: apiKey } : {}) }
    try {
      const r = await fetch(`/api/books/${bookId}/chapters/${chapter.id}/commit-edits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regen: mode === 'render-now', options: opts }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`)
      const appliedN = data.applied?.length || 0
      const skippedN = data.skipped?.length || 0
      const appliedIds = new Set((data.applied || []).map(a => a.chunk_id))
      setStaleChunkIds(prev => {
        const next = new Set(prev)
        for (const id of appliedIds) next.delete(id)
        return next
      })
      setPendingEditCount(skippedN)

      if (mode === 'queue') {
        // commit-edits did NOT spawn; we stage the chapter for batch render
        // so the user can keep adding chapters and process them as a group.
        const qr = await fetch(`/api/queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ chapter_id: chapter.id, options: { ...opts, force: true } }],
          }),
        })
        if (!qr.ok) throw new Error('queued, but stage failed')
        showPhaseDToast(`✓ ${appliedN} edit${appliedN === 1 ? '' : 's'} applied; chapter staged in queue`)
      } else {
        const note = skippedN > 0 ? ` (${skippedN} skipped — already applied or not found)` : ''
        showPhaseDToast(`✓ Applied ${appliedN} edit${appliedN === 1 ? '' : 's'}; rendering…${note}`)
      }
    } catch (err) {
      showPhaseDToast(`Commit failed: ${err.message}`)
    } finally {
      setCommittingEdits(false)
    }
  }, [bookId, chapter.id, committingEdits, pendingEditCount, forTier, apiKey, showPhaseDToast])

  // Phase H: surface this chapter's queue status (active/staged/pending)
  // so the user knows whether their +Queue / Commit-and-queue gesture
  // landed and is being processed.
  const chapterQueueState = (() => {
    if (!queue) return null
    if (queue.active?.chapter_id === chapter.id) return 'rendering'
    if (queue.staged?.some?.((s) => s.chapter_id === chapter.id)) return 'staged'
    if (queue.queue?.some?.((q) => q.chapter_id === chapter.id))  return 'pending'
    return null
  })()

  // ── Phase G: dictate-to-comment while listening ────────────────────────
  // Press D while audio is playing → audio pauses, mic starts recording.
  // Press D again → recording stops and the transcription POSTs as a note
  // comment attached to the sentence that was active when D was pressed.
  // Capturing the chunk at start() keeps the comment anchored to what the
  // listener heard, even if the audio drifts (or auto-resumes) before
  // transcription returns.
  const dictationTargetRef = useRef(null)  // {chunk_id, excerpt, wasPlaying}
  const onDictationTranscribed = useCallback(async (text) => {
    const target = dictationTargetRef.current
    dictationTargetRef.current = null
    const trimmed = (text || '').trim()
    if (!trimmed) {
      showPhaseDToast('Dictation: nothing transcribed')
      if (target?.wasPlaying) playerRef.current?.togglePlay?.()
      return
    }
    try {
      const r = await fetch(`/api/books/${bookId}/review/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter_id: chapter.id,
          chapter_title: chapter.title,
          chapter_slug: chapter.slug,
          excerpt: (target?.excerpt || '').slice(0, 300),
          comment: `🎙 ${trimmed}`,
          type: 'note',
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      onCommentAdded?.()
      showPhaseDToast(`🎙 Comment saved (${trimmed.length} char${trimmed.length === 1 ? '' : 's'})`)
    } catch (err) {
      showPhaseDToast(`Dictation save failed: ${err.message}`)
    }
    // Resume audio if it was playing when D was pressed.
    if (target?.wasPlaying) playerRef.current?.togglePlay?.()
  }, [bookId, chapter.id, chapter.title, chapter.slug, onCommentAdded, showPhaseDToast])

  const dict = useDictation({
    onTranscribe: onDictationTranscribed,
    onError: (err) => showPhaseDToast(`Mic error: ${err.message || err}`),
  })

  const startDictationOnCurrentChunk = useCallback(() => {
    const map = chunkMapRef.current
    if (!map.length) {
      showPhaseDToast('No alignment — open a chapter with audio')
      return
    }
    const idx = findCurrentChunkIdx()
    if (idx < 0) { showPhaseDToast('Position unclear — seek into the chapter first'); return }
    const cur = map[idx]
    const audio = playerRef.current?.audio?.()
    const wasPlaying = audio && !audio.paused
    if (wasPlaying) audio.pause()
    dictationTargetRef.current = {
      chunk_id: cur.chunk_id,
      excerpt: (cur.source_text || cur.text || '').trim(),
      wasPlaying,
    }
    dict.start()
    showPhaseDToast(`🎙 Recording — press D again to stop`)
  }, [dict, findCurrentChunkIdx, showPhaseDToast])

  // Second pass — now that dict + startDictationOnCurrentChunk exist, wire
  // them onto the same ref the keydown listener reads at call time.
  keyHandlersRef.current.dict = dict
  keyHandlersRef.current.startDictationOnCurrentChunk = startDictationOnCurrentChunk

  // ── Phase B: click-to-localize on a sentence/paragraph ────────────────

  const handleContentClick = useCallback((e) => {
    if (!alignedChunks || !chunkMapRef.current.length) return

    // Phase E: Alt+click (or ⌥-click on Mac) opens the inline editor for the
    // sentence under the click. Plain click stays as the play-from-here gesture.
    const sentEl = e.target.closest('.tts-sent')
    const paraEl = e.target.closest('[data-chunk-ids]')
    if ((sentEl || paraEl) && e.altKey) {
      e.preventDefault()
      if (sentEl && paraEl) {
        const wanted = normText(sentEl.textContent)
        let best = null, bestScore = 0
        for (const entry of chunkMapRef.current) {
          if (entry.element !== paraEl) continue
          const score = scoreMatch(entry.source_text || entry.text || '', wanted)
          if (score > bestScore) { bestScore = score; best = entry }
        }
        if (best) {
          openSentenceEdit(best.chunk_id, best.source_text || best.text || sentEl.textContent || '')
          return
        }
      }
      // Paragraph-level fallback — open the first chunk of that paragraph.
      const ids = (paraEl?.dataset.chunkIds || '').split(',').filter(Boolean)
      const first = chunkMapRef.current.find(c => ids.includes(c.chunk_id) && !c.is_pause)
      if (first) {
        openSentenceEdit(first.chunk_id, first.source_text || first.text || paraEl.textContent.slice(0, 200))
      }
      return
    }

    if (!sentEl && !paraEl) return
    if (!playerRef.current) return

    if (sentEl) {
      // Find the chunk whose source_text is closest to the sentence span text.
      const wanted = normText(sentEl.textContent)
      let best = null, bestScore = 0
      for (const entry of chunkMapRef.current) {
        if (entry.element !== paraEl) continue
        const score = scoreMatch(entry.source_text || entry.text || '', wanted)
        if (score > bestScore) { bestScore = score; best = entry }
      }
      const target = best ?? chunkMapRef.current.find(c => c.element === paraEl)
      if (target?.start_seconds != null) {
        const audio = playerRef.current.audio?.()
        if (audio) {
          audio.currentTime = target.start_seconds
          audio.pause()
        }
      }
      return
    }

    // Paragraph fallback (cold-start, before any sentence wrapping happened).
    const start = parseFloat(paraEl.dataset.firstChunkStart || '0')
    const audio = playerRef.current.audio?.()
    if (audio) {
      audio.currentTime = start
      audio.pause()
    }
  }, [alignedChunks])

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

    // Phase F: stale-chunk chime. Fire when transitioning INTO a stale
    // chunk we haven't chimed yet this play session. Each chunk chimes
    // at most once until it's committed (staleChunkIds drops it on
    // commit, which clears chimedChunksRef in the related effect).
    if (activeChunk && activeChunk.chunk_id !== lastActiveChunkIdRef.current) {
      lastActiveChunkIdRef.current = activeChunk.chunk_id
      if (chimeEnabled
          && staleChunkIds.has(activeChunk.chunk_id)
          && !chimedChunksRef.current.has(activeChunk.chunk_id)) {
        chimedChunksRef.current.add(activeChunk.chunk_id)
        playStaleChime()
      }
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
              {pendingEditCount > 0 && (
                <>
                  <button
                    className="regen-btn regen-btn--commit"
                    onClick={() => commitPendingEdits('render-now')}
                    disabled={committingEdits}
                    title="Apply pending sentence edits to source.md and re-render the chapter audio NOW (foreground)"
                  >
                    {committingEdits
                      ? `Committing ${pendingEditCount}…`
                      : `✎ Commit ${pendingEditCount} & render now`}
                  </button>
                  <button
                    className="regen-btn regen-btn--commit-queue"
                    onClick={() => commitPendingEdits('queue')}
                    disabled={committingEdits}
                    title="Apply pending edits to source.md, then stage the chapter for batch processing (no foreground spawn)"
                  >
                    ✎ … & queue
                  </button>
                </>
              )}
              {chapterQueueState && (
                <span
                  className={`chapter-queue-badge chapter-queue-badge--${chapterQueueState}`}
                  title={chapterQueueState === 'rendering'
                    ? 'This chapter is being rendered right now'
                    : chapterQueueState === 'staged'
                      ? 'This chapter is staged — click Process N items in the queue panel to start it'
                      : 'This chapter is queued and will render when its turn comes'}
                >
                  {chapterQueueState === 'rendering' && '🟢 rendering'}
                  {chapterQueueState === 'staged'    && '⚪ staged'}
                  {chapterQueueState === 'pending'   && '⏳ queued'}
                </span>
              )}
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
        <SentenceNavBar
          alignedChunks={alignedChunks}
          chunkMapRef={chunkMapRef}
          playerRef={playerRef}
          onPrevSentence={() => seekRelativeSentence(-1)}
          onNextSentence={() => seekRelativeSentence(1)}
          onPrevParagraph={() => seekRelativeParagraph(-1)}
          onNextParagraph={() => seekRelativeParagraph(1)}
        />
        <div className="player-shortcuts">
          <span><kbd>Space</kbd> play/pause</span>
          {alignedChunks ? (
            <>
              <span><kbd>←</kbd><kbd>→</kbd> ±1 sentence</span>
              <span><kbd>Shift</kbd>+<kbd>←→</kbd> ±1 paragraph</span>
              <span><kbd>R</kbd> repeat sentence</span>
              <span><kbd>B</kbd> bookmark</span>
              <span><kbd>D</kbd> dictate comment</span>
            </>
          ) : (
            <>
              <span><kbd>←</kbd><kbd>→</kbd> ±10s</span>
              <span><kbd>Shift</kbd>+<kbd>←→</kbd> ±30s</span>
            </>
          )}
          <span><kbd>↑</kbd><kbd>↓</kbd> volume</span>
          {alignmentStale && (
            <span className="align-stale-warn" title="Audio was regenerated after alignment was built — re-run audiobook.py --force to fix sync">
              ⚠ sync stale — re-render to fix
            </span>
          )}
          {staleChunkIds.size > 0 && (
            <button
              type="button"
              className="chime-toggle"
              onClick={toggleChime}
              title={chimeEnabled
                ? 'Stale-chunk chime is ON — beep once per pending edit while listening'
                : 'Stale-chunk chime is OFF — click to enable'}
              aria-pressed={chimeEnabled}
            >
              {chimeEnabled ? '🔔' : '🔕'} {staleChunkIds.size}
            </button>
          )}
          {(dict.isRecording || dict.isTranscribing) && (
            <span className={`dictate-pill dictate-pill--${dict.state}`}>
              {dict.isRecording ? `● rec ${dict.elapsed}s — D to stop` : '⟳ transcribing…'}
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
              onClick={handleContentClick}
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

      {/* Phase E inline sentence editor — pause + textarea + tier-aware commit */}
      {sentenceEdit && (
        <div className="sentence-edit-backdrop" onClick={cancelSentenceEdit} aria-hidden="true">
          <div
            className="sentence-edit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sentence-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div id="sentence-edit-title" className="sentence-edit-title">
              ✎ Edit sentence
              <span className="sentence-edit-chunk">chunk {sentenceEdit.chunk_id}</span>
            </div>
            <div className="sentence-edit-original">
              <span className="sentence-edit-label">Was</span>
              <div className="sentence-edit-text">{sentenceEdit.original_text}</div>
            </div>
            <textarea
              autoFocus
              className="sentence-edit-textarea"
              rows={4}
              value={sentenceEdit.draft_text}
              onChange={(e) => setSentenceEdit(s => s ? { ...s, draft_text: e.target.value } : s)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelSentenceEdit()
                } else if ((e.key === 'Enter' || e.key === '↵') && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void commitSentenceEdit('quality')
                }
              }}
            />
            <div className="sentence-edit-actions">
              <button
                type="button"
                className="sentence-edit-btn sentence-edit-btn--primary"
                onClick={() => commitSentenceEdit('quality')}
                title="Commit + queue Quality render (⌘↵)"
              >
                ⌘↵ Commit · Quality
              </button>
              <button
                type="button"
                className="sentence-edit-btn"
                onClick={() => commitSentenceEdit('fast')}
                title="Commit + queue Fast render (preview voice)"
              >
                Commit · Fast
              </button>
              <button
                type="button"
                className="sentence-edit-btn sentence-edit-btn--ghost"
                onClick={cancelSentenceEdit}
                title="Discard (Esc)"
              >
                Esc Cancel
              </button>
            </div>
            <p className="sentence-edit-hint">
              Edits append to the chapter's pending-edits log. Audio will keep playing the
              old render until the queued regen completes (Phase F+).
            </p>
          </div>
        </div>
      )}

      {/* Phase D toast — confirms R/B keyboard actions */}
      {phaseDToast && (
        <div className="phase-d-toast" role="status" aria-live="polite">
          {phaseDToast}
        </div>
      )}

      {/* Phase D splash — three-option resume dialog when chapter has a
          saved mid-listen position. Stays out of the way for fresh visits. */}
      {splashOpen && splashSentence && (
        <div className="resume-splash-backdrop" onClick={splashBrowse} aria-hidden="true">
          <div
            className="resume-splash"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resume-splash-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div id="resume-splash-title" className="resume-splash-title">
              Pick up where you left off?
            </div>
            <div className="resume-splash-excerpt">
              "{splashSentence.text}{splashSentence.text.length >= 120 ? '…' : ''}"
            </div>
            <div className="resume-splash-meta">
              sentence {splashSentence.idx} / {splashSentence.total}
            </div>
            <div className="resume-splash-actions">
              <button className="resume-splash-btn resume-splash-btn--primary" onClick={splashResume}>
                ▶ Resume from sentence {splashSentence.idx}
              </button>
              <button className="resume-splash-btn" onClick={splashFromStart}>
                ▶ From start
              </button>
              <button className="resume-splash-btn resume-splash-btn--ghost" onClick={splashBrowse}>
                Just browse
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
