import { useEffect, useMemo, useState } from 'react'
import {
  X,
  RotateCcw,
  Loader2,
  AlertTriangle,
  AlertOctagon,
  CheckCircle,
  Activity,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

import {
  useChapterMeasurement,
  type RegistryFinding,
  type RegistryMetric,
  type RegistryPipeline,
} from '@/api/chapterMeasurement'
import { useTelemetryPrefs } from '@/api/telemetryPrefs'
import { emitScrollToText } from '../reader/scrollToText'

type Preset = 'gentle' | 'standard' | 'strict'

const PRESETS: Preset[] = ['gentle', 'standard', 'strict']

export interface ChapterTelemetryPanelProps {
  bookId: string
  chapterId: string
  chapterTitle?: string
}

/**
 * Left-docked telemetry panel for the active chapter.
 *
 * Phase 1 surfaced verdict + counts + Top firing detectors. Phase 2:
 *   - Header preset switcher (gentle / standard / strict) reruns
 *     measurement with `?preset=…` so the user can see verdict drift
 *     without leaving the panel.
 *   - Top firing detectors are click-to-expand — each shows its
 *     individual finding excerpts.
 *   - Each finding excerpt is click-to-scroll: emits
 *     `galley:scroll-to-text` (consumed by ChapterView) which scrolls
 *     the prose and flashes the matched text briefly.
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

  const [presetOverride, setPresetOverride] = useState<Preset | null>(null)
  const [expandedDetector, setExpandedDetector] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !visible) return
    if (!entry?.result && !entry?.loading) {
      void measure(bookId, chapterId, presetOverride ? { presetOverride } : undefined)
    }
  }, [enabled, visible, bookId, chapterId, entry?.result, entry?.loading, measure, presetOverride])

  if (!enabled || !visible) return null

  const reg: RegistryPipeline | undefined = entry?.result?.registry_pipeline
  const verdict = reg?.verdict?.verdict
  const blockers = reg?.verdict?.blockers ?? []
  const warnings = reg?.verdict?.warnings ?? []
  const lastMeasured = entry?.lastFetchedAt
  const activePreset = (presetOverride ?? reg?.preset ?? 'standard') as Preset

  const handleRefresh = (preset?: Preset) => {
    void measure(bookId, chapterId, preset ? { presetOverride: preset } : undefined)
  }

  const handlePresetChange = (preset: Preset) => {
    setPresetOverride(preset)
    handleRefresh(preset)
  }

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
          <PresetSwitcher
            value={activePreset}
            disabled={entry?.loading ?? false}
            onChange={handlePresetChange}
          />
          <button
            type="button"
            className="telemetry-icon-btn"
            onClick={() => handleRefresh(presetOverride ?? undefined)}
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
          <ResultView
            reg={reg}
            verdict={verdict ?? 'green'}
            blockers={blockers}
            warnings={warnings}
            expandedDetector={expandedDetector}
            onToggleDetector={(name) =>
              setExpandedDetector((prev) => (prev === name ? null : name))
            }
          />
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

function PresetSwitcher({
  value,
  disabled,
  onChange,
}: {
  value: Preset
  disabled: boolean
  onChange: (p: Preset) => void
}) {
  return (
    <div
      className="telemetry-preset-switcher"
      role="radiogroup"
      aria-label="Prose-review preset override"
    >
      {PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          className={'telemetry-preset-btn' + (value === p ? ' active' : '')}
          disabled={disabled}
          onClick={() => onChange(p)}
          title={`Re-measure with ${p} preset`}
        >
          {p}
        </button>
      ))}
    </div>
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
  expandedDetector,
  onToggleDetector,
}: {
  reg: RegistryPipeline
  verdict: string
  blockers: string[]
  warnings: string[]
  expandedDetector: string | null
  onToggleDetector: (name: string) => void
}) {
  const wordCount = reg.word_count ?? 0
  const detectorCount = reg.metrics?.length ?? 0
  const findingCount = reg.findings?.length ?? 0

  const topFirers = useMemo<RegistryMetric[]>(() => {
    const firing = (reg.metrics ?? []).filter((m) => m.raw_count > 0)
    return [...firing].sort((a, b) => b.raw_count - a.raw_count).slice(0, 12)
  }, [reg.metrics])

  // Group findings by `type` once; drill-down reads from this map.
  const findingsByType = useMemo<Map<string, RegistryFinding[]>>(() => {
    const map = new Map<string, RegistryFinding[]>()
    for (const f of reg.findings ?? []) {
      const key = String(f.type)
      const list = map.get(key) ?? []
      list.push(f)
      map.set(key, list)
    }
    return map
  }, [reg.findings])

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
            {topFirers.map((m) => {
              const expanded = expandedDetector === m.device
              const findings = findingsByType.get(m.device) ?? []
              return (
                <DetectorRow
                  key={m.device}
                  metric={m}
                  expanded={expanded}
                  findings={findings}
                  onToggle={() => onToggleDetector(m.device)}
                />
              )
            })}
          </ul>
        </section>
      ) : null}
    </>
  )
}

function DetectorRow({
  metric,
  expanded,
  findings,
  onToggle,
}: {
  metric: RegistryMetric
  expanded: boolean
  findings: RegistryFinding[]
  onToggle: () => void
}) {
  return (
    <>
      <li
        className="telemetry-metric"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
      >
        <span className="telemetry-metric-name">
          {expanded ? (
            <ChevronDown size={11} style={{ display: 'inline', marginRight: 4 }} aria-hidden="true" />
          ) : (
            <ChevronRight size={11} style={{ display: 'inline', marginRight: 4 }} aria-hidden="true" />
          )}
          {metric.device}
        </span>
        <span className="telemetry-metric-count">
          {metric.raw_count.toLocaleString()}{' '}
          <span className="telemetry-metric-per1k">/ {metric.count_per_1k_tokens}/1k</span>
        </span>
      </li>
      {expanded ? (
        <li className="telemetry-metric-expanded">
          {findings.length === 0 ? (
            <div className="telemetry-finding-empty">
              No per-finding text emitted for this detector (it reports density, not spans).
            </div>
          ) : (
            findings.slice(0, 20).map((f, i) => <FindingExcerpt key={i} finding={f} />)
          )}
          {findings.length > 20 ? (
            <div className="telemetry-finding-empty">
              … {findings.length - 20} more not shown. Use the prose-telemetry CLI for full output.
            </div>
          ) : null}
        </li>
      ) : null}
    </>
  )
}

function FindingExcerpt({ finding }: { finding: RegistryFinding }) {
  // Each detector emits a different "best" snippet — `text`,
  // `extra.sentence`, `extra.match`, `extra.paragraph_excerpt`, etc.
  // Pick the first that looks like prose.
  const snippet = pickSnippet(finding)
  if (!snippet) return null

  return (
    <button
      type="button"
      className="telemetry-finding-excerpt"
      onClick={() => emitScrollToText({ text: snippet, severity: 'info' })}
      title="Scroll to this in the chapter"
    >
      <span className="telemetry-finding-excerpt-text">
        {snippet.length > 240 ? snippet.slice(0, 240) + '…' : snippet}
      </span>
    </button>
  )
}

function pickSnippet(finding: RegistryFinding): string | null {
  const candidates: unknown[] = [
    finding.text,
    (finding as Record<string, unknown>).sentence,
    (finding as Record<string, unknown>).match,
    (finding as Record<string, unknown>).paragraph_excerpt,
  ]
  const extra = (finding as Record<string, unknown>).extra
  if (extra && typeof extra === 'object') {
    for (const key of ['text', 'sentence', 'match', 'paragraph_excerpt', 'first_sentence', 'second_sentence']) {
      candidates.push((extra as Record<string, unknown>)[key])
    }
  }
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length >= 4) return c.trim()
  }
  return null
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
