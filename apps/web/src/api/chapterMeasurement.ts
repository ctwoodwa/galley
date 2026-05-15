import { create } from 'zustand'

/**
 * Chapter-level prose-telemetry results.
 *
 * Per-chapter shape: `results[bookId][chapterId] = MeasurementCacheEntry`.
 *
 * Persistence model: **in-memory only** — measurements are derived
 * data; the chapter file is the source of truth. Switching chapters
 * keeps prior results around (fast re-open), but reloading the page
 * drops them. The user clicks Refresh in the panel to force a fresh
 * call.
 *
 * Talks to the book-server `POST /api/books/:bookId/measure?chapterId=…`
 * endpoint, which spawns prose-telemetry under the configured Python
 * venv and pipes the JSON result back.
 */

export interface RegistryMetric {
  device: string
  raw_count: number
  count_per_1k_tokens: number
  _family?: string
  _tier?: string
  _source?: string
}

export interface RegistryFinding {
  type: string
  confidence?: number
  rule_id?: string
  span?: [number, number] | null
  text?: string
  [extra: string]: unknown
}

export interface RegistryVerdict {
  verdict: 'red' | 'yellow' | 'green' | string
  blockers: string[]
  warnings: string[]
  passes: string[]
}

export interface RegistryPipeline {
  book_id: string
  preset?: string
  active_voice?: string | null
  voice_pass_mode?: string | null
  word_count: number
  findings: RegistryFinding[]
  metrics: RegistryMetric[]
  verdict: RegistryVerdict
}

export interface MeasurementResult {
  registry_pipeline?: RegistryPipeline
  document_metrics?: { word_count?: number; sentence_count?: number; paragraph_count?: number }
  /** Top-level handcount rollup, if the legacy pipeline still ran. */
  rollup?: { verdict?: string; blockers?: string[]; warnings?: string[] }
  [extra: string]: unknown
}

export interface MeasurementCacheEntry {
  bookId: string
  chapterId: string
  result: MeasurementResult | null
  loading: boolean
  error: string | null
  lastFetchedAt: string | null
}

export type MeasurePresetOverride = 'gentle' | 'standard' | 'strict'

export interface MeasureOptions {
  skipStdlib?: boolean
  skipSpacy?: boolean
  skipRegistry?: boolean
  /** Override the book's `prosePreset` for this run only — does not
   *  mutate the BookProfile on disk. The book-server applies it via
   *  the `--preset-override` flag on prose-telemetry CLI. */
  presetOverride?: MeasurePresetOverride
}

interface ChapterMeasurementState {
  results: Record<string, Record<string, MeasurementCacheEntry>>
  /** Run the pipeline on `chapterId` and cache the result. Returns the entry. */
  measure: (
    bookId: string,
    chapterId: string,
    opts?: MeasureOptions,
  ) => Promise<MeasurementCacheEntry>
  /** Clear cached results for a chapter (forces next measure call). */
  invalidate: (bookId: string, chapterId: string) => void
}

function freshEntry(bookId: string, chapterId: string): MeasurementCacheEntry {
  return {
    bookId,
    chapterId,
    result: null,
    loading: false,
    error: null,
    lastFetchedAt: null,
  }
}

export const useChapterMeasurement = create<ChapterMeasurementState>()((set, get) => ({
  results: {},

  measure: async (bookId, chapterId, opts) => {
    const start: MeasurementCacheEntry = {
      ...(get().results[bookId]?.[chapterId] ?? freshEntry(bookId, chapterId)),
      loading: true,
      error: null,
    }
    set((s) => ({
      results: {
        ...s.results,
        [bookId]: { ...(s.results[bookId] ?? {}), [chapterId]: start },
      },
    }))

    const qs = new URLSearchParams({ chapterId })
    if (opts?.skipStdlib) qs.set('no_stdlib', '1')
    if (opts?.skipSpacy) qs.set('no_spacy', '1')
    if (opts?.skipRegistry) qs.set('no_registry', '1')
    if (opts?.presetOverride) qs.set('preset', opts.presetOverride)

    try {
      const res = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/measure?${qs.toString()}`,
        { method: 'POST' },
      )
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        throw new Error(errText.slice(0, 400) || `${res.status} ${res.statusText}`)
      }
      const result = (await res.json()) as MeasurementResult
      const entry: MeasurementCacheEntry = {
        bookId,
        chapterId,
        result,
        loading: false,
        error: null,
        lastFetchedAt: new Date().toISOString(),
      }
      set((s) => ({
        results: {
          ...s.results,
          [bookId]: { ...(s.results[bookId] ?? {}), [chapterId]: entry },
        },
      }))
      return entry
    } catch (e) {
      const msg = (e as Error).message
      const entry: MeasurementCacheEntry = {
        ...(get().results[bookId]?.[chapterId] ?? freshEntry(bookId, chapterId)),
        loading: false,
        error: msg,
        lastFetchedAt: new Date().toISOString(),
      }
      set((s) => ({
        results: {
          ...s.results,
          [bookId]: { ...(s.results[bookId] ?? {}), [chapterId]: entry },
        },
      }))
      return entry
    }
  },

  invalidate: (bookId, chapterId) => {
    set((s) => {
      const bookResults = s.results[bookId]
      if (!bookResults) return s
      const { [chapterId]: _, ...rest } = bookResults
      return { results: { ...s.results, [bookId]: rest } }
    })
  },
}))
