import { useState, useMemo, useRef, useEffect } from 'react'
import { parseAudiobookLog, rateFromHistory } from '@/lib/audiobookProgress'

/**
 * Renders a parsed audiobook.py log as a structured progress card.
 * Shared between GeneratePanel (per-chapter Generate button) and
 * QueuePanel (active queue item). Hides raw log behind a toggle so the
 * user sees signal first, but can still grab the full output for bug
 * reports / engine debugging.
 */
export default function AudiobookProgress({ log, status }) {
  const parsed = useMemo(() => parseAudiobookLog(log), [log])
  const [showRaw, setShowRaw] = useState(false)

  // Track recent (idx, t) samples to estimate sentences/sec → ETA.
  const histRef = useRef([])
  useEffect(() => {
    if (parsed.lastIdx == null) return
    const t = Date.now()
    const h = histRef.current
    if (h.length === 0 || h[h.length - 1].lastIdx !== parsed.lastIdx) {
      h.push({ lastIdx: parsed.lastIdx, t })
      if (h.length > 12) h.splice(0, h.length - 12)
    }
  }, [parsed.lastIdx])

  const rate = rateFromHistory(histRef.current)
  const remaining = (parsed.totalSentences != null && parsed.lastIdx != null)
    ? parsed.totalSentences - parsed.lastIdx
    : null
  const etaSec = (rate && remaining != null && remaining > 0) ? Math.round(remaining / rate) : null
  const isRunning = status === 'running'
  const isDone    = status === 'done' || (parsed.manifestPath && !parsed.crashed)
  const isCrashed = parsed.crashed || status === 'failed'

  const pct = parsed.lastPct ?? 0

  return (
    <div className={`ap${isCrashed ? ' ap--crashed' : isDone ? ' ap--done' : ''}`}>

      {/* Header: engine · voice · speed */}
      <div className="ap-head">
        {parsed.engine && <span className="ap-pill ap-pill--engine">{parsed.engine}</span>}
        {parsed.voice && <span className="ap-pill ap-pill--voice">{parsed.voice}</span>}
        {parsed.speed != null && <span className="ap-pill">{parsed.speed}×</span>}
        {parsed.perSentence && <span className="ap-pill ap-pill--mode">per-sentence</span>}
        {isRunning && !isCrashed && <span className="ap-spinner" aria-label="running" />}
      </div>

      {/* Chapter file */}
      {parsed.chapterFile && (
        <div className="ap-chapter" title={parsed.chapter}>{parsed.chapterFile}</div>
      )}

      {/* Progress bar — shown once we have totals */}
      {parsed.totalSentences != null && (
        <>
          <div className="ap-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="ap-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="ap-counts">
            <span>{(parsed.lastIdx ?? 0).toLocaleString()} / {parsed.totalSentences.toLocaleString()}</span>
            <span>{pct.toFixed(1)}%</span>
            {etaSec != null && <span className="ap-eta">~{formatEta(etaSec)} left</span>}
          </div>
        </>
      )}

      {/* Live last-chunk peek */}
      {parsed.lastKind && (
        <div className={`ap-current ap-current--${parsed.lastKind}`}>
          {parsed.lastKind === 'pause' ? `⏸ ${parsed.lastDesc}` : parsed.lastDesc}
          {parsed.lastDuration != null && <span className="ap-current-t">{parsed.lastDuration.toFixed(1)}s</span>}
        </div>
      )}

      {/* Retries */}
      {parsed.retries > 0 && !isCrashed && (
        <div className="ap-retries">
          ⚠ {parsed.retries} retr{parsed.retries === 1 ? 'y' : 'ies'}
          {parsed.lastRetry && <span className="ap-retry-detail"> — last: {parsed.lastRetry.error.slice(0, 80)}…</span>}
        </div>
      )}

      {/* Crash tail */}
      {isCrashed && parsed.crashTail && (
        <pre className="ap-crash">{parsed.crashTail}</pre>
      )}

      {/* Done — manifest path */}
      {isDone && parsed.manifestPath && (
        <div className="ap-done-line">✓ wrote {parsed.manifestPath}</div>
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
