import { useState, useEffect, useRef, useCallback } from 'react'
import { Outlet, useNavigate, useLocation, useParams, Link } from 'react-router-dom'
import ChapterList from '../../features/chapter-browser/ChapterList.jsx'
import QueuePanel from '../../features/render-queue/QueuePanel.jsx'
import ReviewPanel from '../../features/review-sessions/ReviewPanel.jsx'
import LogPanel from '../../features/build-logs/LogPanel.jsx'
import VoiceTemplatesSettings from '../../features/voice-templates/VoiceTemplatesSettings.jsx'

const SIDEBAR_MIN     = 180
const SIDEBAR_MAX     = 520
const SIDEBAR_DEFAULT = 280
const READER_STATE_KEY = 'inverted-stack-reader-v1'

function loadReaderState() {
  try { return JSON.parse(localStorage.getItem(READER_STATE_KEY) || '{}') }
  catch { return {} }
}

function saveReaderState(updates) {
  try {
    const cur = loadReaderState()
    localStorage.setItem(READER_STATE_KEY, JSON.stringify({ ...cur, ...updates }))
  } catch {}
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { bookId } = useParams()

  const [chapters, setChapters]               = useState([])
  const [selectedId, setSelectedId]           = useState(null)
  const [volume, setVolume]                   = useState('vol-1')
  const [loading, setLoading]                 = useState(true)
  // Drawer overlays — null when none open. Reader stays visible behind.
  const [activePanel, setActivePanel]         = useState(null)
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false)
  const togglePanel = useCallback((name) => {
    setActivePanel((cur) => (cur === name ? null : name))
  }, [])
  const closePanel = useCallback(() => setActivePanel(null), [])
  // Esc closes the active panel
  useEffect(() => {
    if (!activePanel) return undefined
    const onKey = (e) => { if (e.key === 'Escape') closePanel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activePanel, closePanel])
  const [sidebarWidth, setSidebarWidth]       = useState(
    () => parseInt(localStorage.getItem('sidebarWidth') || SIDEBAR_DEFAULT, 10)
  )
  const [queue, setQueue]                     = useState({ active: null, queue: [], staged: [], history: [], batch: null })
  const [reviewSession, setReviewSession]     = useState({ id: null, started: null, comments: [], comment_count: 0 })
  const [savedChapterState, setSavedChapterState] = useState({ audioTime: 0, scrollTop: 0 })

  const dragging = useRef(false)
  const startX   = useRef(0)
  const startW   = useRef(0)

  const onMouseDown = useCallback(e => {
    e.preventDefault()
    dragging.current = true
    startX.current   = e.clientX
    startW.current   = sidebarWidth
    document.body.style.cursor     = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [sidebarWidth])

  useEffect(() => {
    const onMouseMove = e => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      const next  = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW.current + delta))
      setSidebarWidth(next)
    }
    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor     = ''
      document.body.style.userSelect = ''
      setSidebarWidth(w => { localStorage.setItem('sidebarWidth', w); return w })
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const refreshChapters = useCallback(() => {
    fetch(`/api/books/${bookId}/chapters`).then(r => r.json()).then(setChapters).catch(() => {})
  }, [bookId])

  const fetchReviewSession = useCallback(() => {
    fetch(`/api/books/${bookId}/review/session`).then(r => r.json()).then(setReviewSession).catch(() => {})
  }, [bookId])

  useEffect(() => { fetchReviewSession() }, [fetchReviewSession])

  useEffect(() => {
    setLoading(true)
    setChapters([])
    setSelectedId(null)
    fetch(`/api/books/${bookId}/chapters`)
      .then(r => r.json())
      .then(data => {
        setChapters(data)
        setLoading(false)
        const state = loadReaderState()
        if (state.volume) setVolume(state.volume)
        if (state.chapterId && state.bookId === bookId) {
          const ch = data.find(c => c.id === state.chapterId)
          if (ch) {
            setSavedChapterState({ audioTime: state.audioTime || 0, scrollTop: state.scrollTop || 0 })
            setSelectedId(state.chapterId)
          }
        }
      })
      .catch(() => setLoading(false))
  }, [bookId])

  useEffect(() => {
    let es
    function connect() {
      es = new EventSource('/api/events')
      es.addEventListener('catalog-updated', e => {
        const d = JSON.parse(e.data)
        if (!d.bookId || d.bookId === bookId) refreshChapters()
      })
      es.addEventListener('job-done', refreshChapters)
      es.addEventListener('queue-updated', e => setQueue(JSON.parse(e.data)))
      es.onerror = () => { es.close(); setTimeout(connect, 3000) }
    }
    connect()
    return () => es?.close()
  }, [bookId, refreshChapters])

  const handleSelectChapter = useCallback((id) => {
    const state = loadReaderState()
    if (state.chapterId === id && state.bookId === bookId) {
      setSavedChapterState({ audioTime: state.audioTime || 0, scrollTop: state.scrollTop || 0 })
    } else {
      setSavedChapterState({ audioTime: 0, scrollTop: 0 })
      saveReaderState({ bookId, chapterId: id, audioTime: 0, scrollTop: 0 })
    }
    setSelectedId(id)
    if (location.pathname !== `/read/${bookId}`) navigate(`/read/${bookId}`)
  }, [bookId, location.pathname, navigate])

  const handleVolumeSwitch = useCallback((vol) => {
    setVolume(vol)
    setSelectedId(null)
    saveReaderState({ bookId, volume: vol, chapterId: null, audioTime: 0, scrollTop: 0 })
  }, [bookId])

  const selected  = chapters.find(c => c.id === selectedId) || null
  const queueBusy = !!(queue.active || queue.queue.length > 0 || queue.staged?.length > 0)

  const base    = `/read/${bookId}`
  const isRoute = (sub) => {
    const full = sub ? `${base}/${sub}` : base
    return location.pathname === full || location.pathname.startsWith(full + '/')
  }

  // Unique volume ids from this book's chapters
  const volumeIds = [...new Set(chapters.map(c => c.volume))].sort()

  const outletContext = {
    bookId, chapters, selected, volume, loading,
    queue, queueBusy, refreshChapters,
    reviewSession, fetchReviewSession,
    savedChapterState, saveReaderState,
    onCommentAdded: fetchReviewSession,
    onAudioGenerated: refreshChapters,
    onAddToQueue: () => setActivePanel('queue'),
    onReaderStateChange: saveReaderState,
  }

  const isRendering = queue.batch && queue.batch.total > 0
  return (
    <div className={`app${isRendering ? ' app--rendering' : ''}`}>
      <div className="sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
        <div className="sidebar-header">
          <Link to="/" className="sidebar-library-link">← Library</Link>
          <div className="volume-tabs">
            {volumeIds.map(vid => (
              <button
                key={vid}
                className={`vol-tab ${volume === vid ? 'active' : ''}`}
                onClick={() => handleVolumeSwitch(vid)}
              >
                {vid.replace('vol-', 'Vol ')}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="sidebar-empty">Loading chapters…</div>
        ) : (
          <ChapterList
            chapters={chapters.filter(c => c.volume === volume)}
            selectedId={selectedId}
            onSelect={handleSelectChapter}
          />
        )}
      </div>

      <div className="resize-handle" onMouseDown={onMouseDown} />

      <div className="main">
        <div className="main-topbar">
          <button
            className={`queue-toggle${activePanel === null ? ' queue-toggle--busy' : ''}`}
            onClick={() => setActivePanel(null)}
            title="Hide all overlay panels"
          >Read</button>
          <button
            type="button"
            className="topbar-gear"
            onClick={() => setVoiceSettingsOpen(true)}
            title="Voice template settings"
            aria-label="Voice templates"
          >⚙</button>
          <TopbarMenu
            activePanel={activePanel}
            togglePanel={togglePanel}
            reviewCount={reviewSession.comment_count || 0}
            queueCount={(queue.staged?.length || 0) + queue.queue.length + (queue.active ? 1 : 0)}
            queueBusy={queueBusy}
          />
        </div>

        <Outlet context={outletContext} />
      </div>

      {/* ── Overlay drawers — chapter content stays visible behind ─────── */}
      {activePanel && (
        <>
          <div className="panel-overlay-backdrop" onClick={closePanel} aria-hidden="true" />
          {activePanel === 'review' && (
            <ReviewPanel
              bookId={bookId}
              session={reviewSession}
              onClose={closePanel}
              onSessionUpdate={fetchReviewSession}
            />
          )}
          {activePanel === 'queue' && (
            <QueuePanel
              chapters={chapters}
              queue={queue}
              onClose={closePanel}
            />
          )}
          {activePanel === 'logs' && (
            <LogPanel
              bookId={bookId}
              onClose={closePanel}
            />
          )}
        </>
      )}

      <VoiceTemplatesSettings
        open={voiceSettingsOpen}
        onClose={() => setVoiceSettingsOpen(false)}
      />

      {/* Topbar hamburger menu defined in this file so it has direct access
          to togglePanel + counts; not worth a separate file at this size. */}

      {queue.batch && queue.batch.total > 0 && (
        <div className="render-progress-footer">
          <div className="render-progress-label">
            Rendering {queue.batch.done}/{queue.batch.total} chapters
            {queue.active && <span className="render-progress-current"> — {queue.active.chapter_title}</span>}
          </div>
          <div className="render-progress-track">
            <div
              className="render-progress-fill"
              style={{ width: `${Math.round((queue.batch.done / queue.batch.total) * 100)}%` }}
            />
          </div>
          <div className="render-progress-pct">
            {Math.round((queue.batch.done / queue.batch.total) * 100)}%
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Topbar hamburger that opens a small dropdown with Review / Queue / Logs.
 * Each item shows its own activity badge (review comments, queue depth)
 * and reflects whether that panel is currently open. Click outside or Esc
 * closes the menu.
 */
function TopbarMenu({ activePanel, togglePanel, reviewCount, queueCount, queueBusy }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const hasActivity = reviewCount > 0 || queueBusy
  const totalBadge = reviewCount + queueCount

  const pick = (name) => {
    togglePanel(name)
    setOpen(false)
  }

  return (
    <div className="topbar-menu" ref={wrapperRef}>
      <button
        type="button"
        className={`topbar-menu-trigger${hasActivity ? ' topbar-menu-trigger--has-activity' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Open panels menu"
      >
        ☰
        {totalBadge > 0 && <span className="topbar-menu-badge">{totalBadge}</span>}
      </button>
      {open && (
        <div className="topbar-menu-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className={`topbar-menu-item${activePanel === 'review' ? ' topbar-menu-item--active' : ''}`}
            onClick={() => pick('review')}
          >
            <span>Review</span>
            {reviewCount > 0 && (
              <span className="topbar-menu-item-badge topbar-menu-item-badge--review">{reviewCount}</span>
            )}
          </button>
          <button
            type="button"
            role="menuitem"
            className={`topbar-menu-item${activePanel === 'queue' ? ' topbar-menu-item--active' : ''}`}
            onClick={() => pick('queue')}
          >
            <span>Queue</span>
            {queueCount > 0 && (
              <span className="topbar-menu-item-badge">{queueCount}</span>
            )}
          </button>
          <button
            type="button"
            role="menuitem"
            className={`topbar-menu-item${activePanel === 'logs' ? ' topbar-menu-item--active' : ''}`}
            onClick={() => pick('logs')}
          >
            <span>Logs</span>
          </button>
        </div>
      )}
    </div>
  )
}
