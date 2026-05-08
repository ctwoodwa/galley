import { useState, useMemo, useRef, useEffect } from 'react'
import { parseAudiobookLog, rateFromHistory } from '@/lib/audiobookProgress'

/**
 * Renders a parsed audiobook.py log as a structured progress card.
 * Shared between GeneratePanel (per-chapter Generate button) and
 * QueuePanel (active queue item). Hides raw log behind a toggle so the
 * user sees signal first, but can still grab the full output for bug
 * reports / engine debugging.
 */
// Fields that we expect to see ONCE near the top of audiobook.py's stdout
// and want to keep displaying even after they scroll out of the polled
// tail window (e.g. on a 349-sentence render with a 200-line tail, the
// "=> chapter" + "N sentences, M chars" header lines disappear by ~30%
// of the way through). Without stickiness the progress bar would vanish
// mid-run and the card would degrade into just the last-chunk peek.
const STICKY_FIELDS = [
  'engine', 'engineDesc', 'baseUrl', 'model',
  'defaultPreset', 'chapterMap',
  'chapter', 'chapterFile', 'preset', 'voice', 'speed', 'perSentence',
  'totalSentences', 'totalChars',
]

export default function AudiobookProgress({ log, status }) {
  const parsed = useMemo(() => parseAudiobookLog(log), [log])
  const [showRaw, setShowRaw] = useState(false)

  // Sticky high-water-mark for header fields that scroll off the tail.
  const stickyRef = useRef({})
  for (const k of STICKY_FIELDS) {
    if (parsed[k] != null && parsed[k] !== false) stickyRef.current[k] = parsed[k]
  }
  const view = { ...parsed }
  for (const [k, v] of Object.entries(stickyRef.current)) {
    if (view[k] == null) view[k] = v
  }

  // Track recent (idx, t) samples to estimate sentences/sec → ETA.
  const histRef = useRef([])
  useEffect(() => {
    if (view.lastIdx == null) return
    const t = Date.now()
    const h = histRef.current
    if (h.length === 0 || h[h.length - 1].lastIdx !== view.lastIdx) {
      h.push({ lastIdx: view.lastIdx, t })
      if (h.length > 12) h.splice(0, h.length - 12)
    }
  }, [view.lastIdx])

  const rate = rateFromHistory(histRef.current)
  const remaining = (view.totalSentences != null && view.lastIdx != null)
    ? view.totalSentences - view.lastIdx
    : null
  const etaSec = (rate && remaining != null && remaining > 0) ? Math.round(remaining / rate) : null
  const isRunning = status === 'running'
  const isDone    = status === 'done' || (view.manifestPath && !view.crashed)
  const isCrashed = view.crashed || status === 'failed'

  const pct = view.lastPct ?? 0

  return (
    <div className={`ap${isCrashed ? ' ap--crashed' : isDone ? ' ap--done' : ''}`}>

      {/* Header: engine · voice · speed */}
      <div className="ap-head">
        {view.engine && <span className="ap-pill ap-pill--engine">{view.engine}</span>}
        {view.voice && <span className="ap-pill ap-pill--voice">{view.voice}</span>}
        {view.speed != null && <span className="ap-pill">{view.speed}×</span>}
        {view.perSentence && <span className="ap-pill ap-pill--mode">per-sentence</span>}
        {isRunning && !isCrashed && <span className="ap-spinner" aria-label="running" />}
      </div>

      {/* Chapter file */}
      {view.chapterFile && (
        <div className="ap-chapter" title={view.chapter}>{view.chapterFile}</div>
      )}

      {/* Progress bar — shown once we have totals */}
      {view.totalSentences != null && (
        <>
          <div className="ap-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="ap-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="ap-counts">
            <span>{(view.lastIdx ?? 0).toLocaleString()} / {view.totalSentences.toLocaleString()}</span>
            <span>{pct.toFixed(1)}%</span>
            {etaSec != null && <span className="ap-eta">~{formatEta(etaSec)} left</span>}
          </div>
        </>
      )}

      {/* Live last-chunk peek */}
      {view.lastKind && (
        <div className={`ap-current ap-current--${view.lastKind}`}>
          {view.lastKind === 'pause' ? `⏸ ${view.lastDesc}` : view.lastDesc}
          {view.lastDuration != null && <span className="ap-current-t">{view.lastDuration.toFixed(1)}s</span>}
        </div>
      )}

      {/* Retries */}
      {view.retries > 0 && !isCrashed && (
        <div className="ap-retries">
          ⚠ {view.retries} retr{view.retries === 1 ? 'y' : 'ies'}
          {view.lastRetry && <span className="ap-retry-detail"> — last: {view.lastRetry.error.slice(0, 80)}…</span>}
        </div>
      )}

      {/* Crash tail */}
      {isCrashed && view.crashTail && (
        <pre className="ap-crash">{view.crashTail}</pre>
      )}

      {/* Done — manifest path */}
      {isDone && view.manifestPath && (
        <div className="ap-done-line">✓ wrote {view.manifestPath}</div>
      )}

      {/* Show / hide raw log */}
      {log && (
        <>
          <button
            type="button"
            className="ap-toggle"
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? '▲ hide raw log' : '▽ show raw log'}
          </button>
          {showRaw && <pre className="ap-raw">{log}</pre>}
        </>
      )}
    </div>
  )
}

function formatEta(sec) {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return `${m}m${s ? ` ${s}s` : ''}`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}
