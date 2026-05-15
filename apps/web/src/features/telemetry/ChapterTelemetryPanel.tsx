import { useEffect, useMemo } from 'react'
import {
  X,
  RotateCcw,
  Loader2,
  AlertTriangle,
  AlertOctagon,
  CheckCircle,
  Activity,
} from 'lucide-react'

import {
  useChapterMeasurement,
  type RegistryMetric,
  type RegistryPipeline,
} from '@/api/chapterMeasurement'
import { useTelemetryPrefs } from '@/api/telemetryPrefs'

export interface ChapterTelemetryPanelProps {
  bookId: string
  chapterId: string
  chapterTitle?: string
}

/**
 * Left-docked telemetry panel for the active chapter.
 *
 * Toggled by ⌘M / Ctrl+M (handled by `useTelemetryKeybind`). On open,
 * triggers a fresh measurement if no cached result exists for the
 * current chapter; otherwise renders the cached result and shows the
 * "Last measured: …" timestamp. The Refresh button always forces a
 * new call.
 *
 * Sits on the LEFT so it can coexist with the chat panel on the right
 * without overlap. Both default to hidden; user opens whichever
 * surfaces they want.
 */
export function ChapterTelemetryPanel({
  bookId,
  chapterId,
  chapterTitle,
}: ChapterTelemetryPanelProps) {
  const visible = useTelemetryPrefs((s) => s.visible)
  const enabled = useTelemetryPrefs((s) => s.enabled)
  const setVisible = useTelemetryPrefs((s) => s.setVisible)

  const entry = useChapterMeasurement((s) => s.results[bookId]?.[chapterId])
  const measure = useChapterMeasurement((s) => s.measure)

  // Auto-measure on first open of a chapter that has no cached result.
  useEffect(() => {
    if (!enabled || !visible) return
    if (!entry?.result && !entry?.loading) {
      void measure(bookId, chapterId)
    }
  }, [enabled, visible, bookId, chapterId, entry?.result, entry?.loading, measure])

  if (!enabled || !visible) return null

  const reg: RegistryPipeline | undefined = entry?.result?.registry_pipeline
  const verdict = reg?.verdict?.verdict
  const blockers = reg?.verdict?.blockers ?? []
  const warnings = reg?.verdict?.warnings ?? []
  const lastMeasured = entry?.lastFetchedAt

  return (
    <aside className="telemetry-panel" data-telemetry-panel>
      <header className="telemetry-panel-header">
        <div className="telemetry-panel-title">
          <span className="telemetry-panel-eyebrow">Chapter telemetry</span>
          {chapterTitle ? (
            <span className="telemetry-panel-chapter">{chapterTitle}</span>
          ) : null}
        </div>
        <div className="telemetry-panel-actions">
          <button
            type="button"
            className="telemetry-icon-btn"
            onClick={() => measure(bookId, chapterId)}
            disabled={entry?.loading}
            title="Refresh measurement"
          >
            {entry?.loading ? (
              <Loader2 size={14} className="telemetry-spinner" aria-hidden="true" />
            ) : (
              <RotateCcw size={14} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="telemetry-icon-btn"
            onClick={() => setVisible(false)}
            title="Close (Esc)"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="telemetry-panel-scroller">
        {entry?.error ? (
          <ErrorBox message={entry.error} />
        ) : entry?.loading && !entry?.result ? (
          <LoadingState />
        ) : !entry?.result || !reg ? (
          <EmptyState />
        ) : (
          <ResultView reg={reg} verdict={verdict ?? 'green'} blockers={blockers} warnings={warnings} />
        )}
      </div>

      {lastMeasured ? (
        <footer className="telemetry-panel-footer">
          Last measured: <time dateTime={lastMeasured}>{formatRelative(lastMeasured)}</time>
        </footer>
      ) : null}
    </aside>
  )
}

function EmptyState() {
  return (
    <div className="telemetry-panel-empty">
      <p>No measurement yet for this chapter.</p>
      <p className="telemetry-panel-hint">Press Refresh to run the prose pipeline.</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="telemetry-panel-empty">
      <Loader2 size={16} className="telemetry-spinner" aria-hidden="true" />
      <span style={{ marginLeft: '0.5rem' }}>Running prose-telemetry…</span>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="telemetry-error">
      <AlertTriangle size={14} aria-hidden="true" />
      <div>
        <p style={{ margin: 0, fontWeight: 600 }}>Measurement failed</p>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem' }}>{message}</p>
      </div>
    </div>
  )
}

function ResultView({
  reg,
  verdict,
  blockers,
  warnings,
}: {
  reg: RegistryPipeline
  verdict: string
  blockers: string[]
  warnings: string[]
}) {
  const wordCount = reg.word_count ?? 0
  const detectorCount = reg.metrics?.length ?? 0
  const findingCount = reg.findings?.length ?? 0

  // Top firing detectors (raw_count > 0), sorted descending. Limited
  // to the top 12 so the panel doesn't sprawl on chapters with very
  // long detector tails.
  const topFirers = useMemo<RegistryMetric[]>(() => {
    const firing = (reg.metrics ?? []).filter((m) => m.raw_count > 0)
    return [...firing].sort((a, b) => b.raw_count - a.raw_count).slice(0, 12)
  }, [reg.metrics])

  return (
    <>
      <section className="telemetry-section">
        <div className={`telemetry-verdict-card telemetry-verdict-${verdict}`}>
          <VerdictIcon verdict={verdict} />
          <div className="telemetry-verdict-body">
            <span className="telemetry-verdict-label">{verdict.toUpperCase()}</span>
            <span className="telemetry-verdict-sub">
              {blockers.length} blocker{blockers.length === 1 ? '' : 's'},{' '}
              {warnings.length} warning{warnings.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="telemetry-meta-grid">
          <div>
            <span className="telemetry-meta-num">{wordCount.toLocaleString()}</span>
            <span className="telemetry-meta-label">words</span>
          </div>
          <div>
            <span className="telemetry-meta-num">{detectorCount}</span>
            <span className="telemetry-meta-label">detectors</span>
          </div>
          <div>
            <span className="telemetry-meta-num">{findingCount}</span>
            <span className="telemetry-meta-label">findings</span>
          </div>
          <div>
            <span className="telemetry-meta-num">{reg.preset ?? 'standard'}</span>
            <span className="telemetry-meta-label">preset</span>
          </div>
        </div>
      </section>

      {blockers.length > 0 ? (
        <section className="telemetry-section">
          <h3 className="telemetry-section-title telemetry-section-title-blocker">
            Blockers
          </h3>
          <ul className="telemetry-finding-list">
            {blockers.map((b, i) => (
              <li key={i} className="telemetry-finding telemetry-finding-blocker">
                <AlertOctagon size={11} aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {warnings.length > 0 ? (
        <section className="telemetry-section">
          <h3 className="telemetry-section-title telemetry-section-title-warning">
            Warnings
          </h3>
          <ul className="telemetry-finding-list">
            {warnings.map((w, i) => (
              <li key={i} className="telemetry-finding telemetry-finding-warning">
                <AlertTriangle size={11} aria-hidden="true" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {topFirers.length > 0 ? (
        <section className="telemetry-section">
          <h3 className="telemetry-section-title">Top firing detectors</h3>
          <ul className="telemetry-metric-list">
            {topFirers.map((m) => (
              <li key={m.device} className="telemetry-metric">
                <span className="telemetry-metric-name">{m.device}</span>
                <span className="telemetry-metric-count">
                  {m.raw_count.toLocaleString()}{' '}
                  <span className="telemetry-metric-per1k">/ {m.count_per_1k_tokens}/1k</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

function VerdictIcon({ verdict }: { verdict: string }) {
  if (verdict === 'red') return <AlertOctagon size={20} aria-hidden="true" />
  if (verdict === 'yellow') return <AlertTriangle size={20} aria-hidden="true" />
  if (verdict === 'green') return <CheckCircle size={20} aria-hidden="true" />
  return <Activity size={20} aria-hidden="true" />
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const seconds = Math.floor(diff / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleString()
}
