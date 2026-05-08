import { useState, useEffect, useRef, useCallback, forwardRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

const POLL_INTERVAL = 3000
const LOG_LINE_PX = 20

// ── Virtualized log lines (extracted; uses react-virtual to handle 1000s of lines) ────
const VirtualizedLogLines = forwardRef(function VirtualizedLogLines(
  { logData, autoScroll, onScroll },
  forwardedRef,
) {
  const internalRef = useRef(null)
  // Bridge external ref + internal ref for both onScroll wiring and autoscroll
  const setRefs = useCallback(
    (el) => {
      internalRef.current = el
      if (typeof forwardedRef === 'function') forwardedRef(el)
      else if (forwardedRef) forwardedRef.current = el
    },
    [forwardedRef],
  )

  const lines = useMemo(() => logData?.lines ?? [], [logData])

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => internalRef.current,
    estimateSize: () => LOG_LINE_PX,
    overscan: 12,
  })

  // Auto-scroll to bottom on new lines if user is following the tail
  useEffect(() => {
    if (autoScroll && lines.length > 0) {
      virtualizer.scrollToIndex(lines.length - 1, { align: 'end' })
    }
  }, [lines.length, autoScroll, virtualizer])

  return (
    <div className="log-lines" ref={setRefs} onScroll={onScroll}>
      {!logData && <div className="log-loading">Loading…</div>}
      {logData && lines.length > 0 && (
        <div
          style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const line = lines[vi.index]
            return (
              <div
                key={vi.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <LogLine line={line} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})
const HEIGHT_KEY = 'log-panel-height'
const HEIGHT_MIN = 160
const HEIGHT_MAX = Math.round(window.innerHeight * 0.85)
const HEIGHT_DEFAULT = 320

// ── Line colorization ─────────────────────────────────────────────────────────

function classifyLine(line) {
  if (!line.trim()) return 'log-blank'
  if (/Traceback|^\s+File "/.test(line)) return 'log-error'
  if (/\bError\b/.test(line) && !/retry \d/.test(line)) return 'log-error'
  if (/retry \d+\/\d+/.test(line)) return 'log-retry'
  if (/\[\s*\d+\/\d+\]\s+[\d.]+%/.test(line)) return 'log-chunk'
  if (/\[pause\]|\bpause\b/i.test(line) && line.trim().length < 30) return 'log-pause'
  if (/^(Engine|base_url|preset|voice|speed|exaggeration|cfg_weight|mode|chapter|output|Rendering|Writing|Saved|Done|Finished)\s*[:=]/i.test(line.trim())) return 'log-header'
  if (/100\.0%|Done\.|Finished\.|✓|saved to|completed/i.test(line)) return 'log-success'
  return 'log-default'
}

function LogLine({ line }) {
  const cls = classifyLine(line)
  return <div className={`log-line ${cls}`}>{line || '​'}</div>
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusDot({ status }) {
  const map = { running: 'dot-running', done: 'dot-done', error: 'dot-error', incomplete: 'dot-incomplete' }
  return <span className={`log-dot ${map[status] || 'dot-done'}`} />
}

// ── Log list item ─────────────────────────────────────────────────────────────

function LogItem({ log, selected, onSelect }) {
  const label = log.filename
    .replace(/\.log$/, '')
    .replace(/-web-\d+$/, '')
    .replace(/-(\d{8})-(\d{6})$/, ' $1')
  return (
    <button
      className={`log-item ${selected ? 'log-item--active' : ''}`}
      onClick={() => onSelect(log.filename)}
    >
      <StatusDot status={log.status} />
      <span className="log-item-name">{label}</span>
      {log.status === 'running' && <span className="log-item-prog">{log.progress.toFixed(0)}%</span>}
      {log.status === 'incomplete' && log.lastChunk != null && (
        <span className="log-item-prog log-item-prog--stale">{log.progress.toFixed(0)}%</span>
      )}
      {log.hasRetry && log.status !== 'error' && <span className="log-item-warn">!</span>}
      {log.hasError && <span className="log-item-err">✕</span>}
    </button>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function LogPanel({ bookId, onClose, inline = false }) {
  const [panelHeight, setPanelHeight] = useState(
    () => Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, parseInt(localStorage.getItem(HEIGHT_KEY) || HEIGHT_DEFAULT, 10)))
  )
  const [maximized, setMaximized] = useState(false)

  const [logs, setLogs] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [logData, setLogData] = useState(null)
  const [filter, setFilter] = useState('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const [lineOffset, setLineOffset] = useState(0)

  const contentRef = useRef(null)
  const pollRef = useRef(null)
  const dragRef = useRef({ active: false, startY: 0, startH: 0 })
  const prevHeightRef = useRef(HEIGHT_DEFAULT)

  // ── Panel resize ──────────────────────────────────────────────────────────

  const onDragMouseDown = useCallback((e) => {
    e.preventDefault()
    dragRef.current = { active: true, startY: e.clientY, startH: panelHeight }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [panelHeight])

  useEffect(() => {
    function onMouseMove(e) {
      if (!dragRef.current.active) return
      const delta = dragRef.current.startY - e.clientY
      const next = Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, dragRef.current.startH + delta))
      setPanelHeight(next)
    }
    function onMouseUp() {
      if (!dragRef.current.active) return
      dragRef.current.active = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setPanelHeight(h => { localStorage.setItem(HEIGHT_KEY, String(h)); return h })
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const toggleMaximize = useCallback(() => {
    setMaximized(m => {
      if (m) {
        setPanelHeight(prevHeightRef.current)
      } else {
        prevHeightRef.current = panelHeight
        setPanelHeight(Math.round(window.innerHeight * 0.82))
      }
      return !m
    })
  }, [panelHeight])

  const effectiveHeight = maximized ? Math.round(window.innerHeight * 0.82) : panelHeight

  // ── Fetch log list ──────────────────────────────────────────────────────────

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch(`/api/books/${bookId}/logs`)
      if (res.ok) setLogs(await res.json())
    } catch {}
  }, [])

  useEffect(() => {
    fetchList()
    const t = setInterval(fetchList, POLL_INTERVAL)
    return () => clearInterval(t)
  }, [fetchList])

  // ── Fetch selected log content ──────────────────────────────────────────────

  const fetchFull = useCallback(async (filename) => {
    try {
      const res = await fetch(`/api/books/${bookId}/logs/${encodeURIComponent(filename)}`)
      if (!res.ok) return
      const data = await res.json()
      setLogData(data)
      setLineOffset(data.total_lines)
    } catch {}
  }, [])

  const fetchTail = useCallback(async (filename, from) => {
    try {
      const res = await fetch(`/api/books/${bookId}/logs/${encodeURIComponent(filename)}/tail?from=${from}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.lines.length > 0) {
        setLogData(prev => prev ? {
          ...prev,
          lines: [...prev.lines, ...data.lines].slice(-1000),
          status: data.status,
          progress: data.progress,
          lastChunk: data.lastChunk,
          totalChunks: data.totalChunks,
          total_lines: data.total_lines,
        } : null)
        setLineOffset(data.total_lines)
      } else {
        setLogData(prev => prev ? { ...prev, status: data.status, progress: data.progress } : null)
      }
    } catch {}
  }, [])

  const handleSelect = useCallback((filename) => {
    setSelectedFile(filename)
    setLogData(null)
    setLineOffset(0)
    fetchFull(filename)
  }, [fetchFull])

  useEffect(() => {
    if (!selectedFile && logs.length > 0) handleSelect(logs[0].filename)
  }, [logs, selectedFile, handleSelect])

  useEffect(() => {
    clearInterval(pollRef.current)
    if (!selectedFile || !logData) return
    if (logData.status !== 'running') return
    pollRef.current = setInterval(() => fetchTail(selectedFile, lineOffset), POLL_INTERVAL)
    return () => clearInterval(pollRef.current)
  }, [selectedFile, logData?.status, lineOffset, fetchTail])

  useEffect(() => {
    if (autoScroll && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [logData?.lines?.length, autoScroll])

  const handleContentScroll = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }, [])

  // ── Filtering ───────────────────────────────────────────────────────────────

  const filtered = logs.filter(l => {
    if (filter === 'running') return l.status === 'running'
    if (filter === 'errors') return l.hasError || l.status === 'error'
    if (filter === 'batch') return l.isBatch
    return true
  })

  const selectedLog = logs.find(l => l.filename === selectedFile)
  const progress = logData?.progress ?? 0
  const showProgress = logData && progress > 0 && progress < 99.5

  return (
    <div className={`log-panel${inline ? ' log-panel--inline' : ''}`} style={inline ? undefined : { height: effectiveHeight }}>
      {/* Drag handle — drawer mode only */}
      {!inline && <div className="log-resize-handle" onMouseDown={onDragMouseDown} title="Drag to resize" />}

      {/* Header */}
      <div className="log-panel-header">
        <span className="log-panel-title">Build Logs</span>
        <div className="log-filter-tabs">
          {['all', 'running', 'errors', 'batch'].map(f => (
            <button
              key={f}
              className={`log-filter-tab ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'running' && logs.filter(l => l.status === 'running').length > 0 && (
                <span className="log-filter-count">{logs.filter(l => l.status === 'running').length}</span>
              )}
              {f === 'errors' && logs.filter(l => l.hasError || l.status === 'error').length > 0 && (
                <span className="log-filter-count log-filter-count--err">{logs.filter(l => l.hasError || l.status === 'error').length}</span>
              )}
            </button>
          ))}
        </div>
        <button
          className={`log-maximize-btn ${maximized ? 'active' : ''}`}
          onClick={toggleMaximize}
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? '⊟' : '⊞'}
        </button>
        {onClose && (
          <button className="log-panel-close" onClick={onClose} title="Close">✕</button>
        )}
      </div>

      {/* Body */}
      <div className="log-panel-body">
        {/* Log list */}
        <div className="log-list">
          {filtered.length === 0 && (
            <div className="log-list-empty">No logs</div>
          )}
          {filtered.map(log => (
            <LogItem
              key={log.filename}
              log={log}
              selected={log.filename === selectedFile}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {/* Log content */}
        <div className="log-content-pane">
          {showProgress && (
            <div className="log-progress-bar-wrap">
              <div className="log-progress-bar" style={{ width: `${progress}%` }} />
              <span className="log-progress-label">
                {logData.lastChunk != null
                  ? `${logData.lastChunk}/${logData.totalChunks} chunks — ${progress.toFixed(1)}%`
                  : `${progress.toFixed(1)}%`}
                {selectedLog?.status === 'running' && <span className="log-running-pill">live</span>}
              </span>
            </div>
          )}
          {selectedLog?.status === 'done' && logData?.lastChunk != null && (
            <div className="log-progress-bar-wrap log-progress-bar-wrap--done">
              <div className="log-progress-bar log-progress-bar--done" style={{ width: '100%' }} />
              <span className="log-progress-label">{logData.lastChunk}/{logData.totalChunks} chunks — done</span>
            </div>
          )}

          <VirtualizedLogLines
            ref={contentRef}
            logData={logData}
            autoScroll={autoScroll}
            onScroll={handleContentScroll}
          />

          <div className="log-content-footer">
            {logData && (
              <span className="log-line-count">{logData.total_lines} lines</span>
            )}
            <button
              className={`log-autoscroll-btn ${autoScroll ? 'active' : ''}`}
              onClick={() => {
                const next = !autoScroll
                setAutoScroll(next)
                if (next && contentRef.current) contentRef.current.scrollTop = contentRef.current.scrollHeight
              }}
              title="Auto-scroll to bottom"
            >
              ↓ Auto-scroll
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
