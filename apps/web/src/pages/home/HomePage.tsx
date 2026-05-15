import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Settings,
  CircleUser,
  Moon,
  SunMedium,
  X,
  PenTool,
  Mic,
  Frame,
  Wand2,
} from 'lucide-react'

import DirectoryPicker from '../../components/DirectoryPicker.jsx'
import { useThemePrefs } from '../../api/themePrefs'
import './home.css'

/**
 * Galley home — "Auteur's Atelier."
 *
 * Studio entrance. Establishes the platform's tone (local-first editorial
 * production for the writer-director), routes the user into work, and
 * surfaces identity + system state without hijacking attention from the
 * productions themselves.
 *
 * The page is organised as four Acts:
 *   I.  Productions   — the user's books rendered as production slates
 *   II. Workshops     — the twelve capability areas from the platform spec
 *   III. Atelier      — settings, services, plugins, account, logs
 *   (System reel along the foot: live slot health + a wall-clock.)
 */

interface BookEntry {
  id: string
  title: string
  bookRoot: string
  audioRoot?: string
  chapter_count?: number
  volumes?: Array<{ label: string }>
  updatedAt?: string
  status?: 'draft' | 'revision' | 'final' | 'archived'
}

/**
 * Production-graph response shape from GET /api/books/:bookId/graph.
 * Mirrors the B.1 API contract in docs/architecture/galley-production-graph.md.
 * Only the fields the home page reads are typed here; the full graph carries
 * more that the Dashboard / Workspaces surfaces will need in later phases.
 */
interface ProductionGraphSummary {
  scaffolded: boolean
  production?: {
    id: string
    title: string
    kind: 'book' | 'screenplay' | 'graphic-novel' | 'animatic' | 'mixed'
    status:
      | 'in-development'
      | 'in-production'
      | 'in-post'
      | 'wrapped'
      | 'archived'
    versioningBackend?: 'git' | 'cache'
    activeVoice?: string
    eventCoverage?: { scaffold?: string | null }
  }
  participants?: Array<{ id: string; name: string; role: string }>
  narrativeUnits?: Array<{ id: string; kind: string; sourcePath?: string | null }>
  assets?: Array<{ id: string; kind: string }>
  _index?: { lastBuilt?: string | null; dirty?: boolean; objectCount?: number }
}

interface DiscoveryResult {
  audioRoot?: string
  matched?: number
  chapter_count?: number
  volumes?: string[]
}

const WORKSHOPS: WorkshopGroup[] = [
  {
    medium: 'Prose',
    icon: PenTool,
    items: [
      { name: 'Prose editor', status: 'in-progress' },
      { name: 'Story bible & metadata', status: 'planned' },
      { name: 'Script & dialogue', status: 'reserved' },
      { name: 'Literary-device telemetry', status: 'shipped' },
    ],
  },
  {
    medium: 'Audio',
    icon: Mic,
    items: [
      { name: 'Audiobook export', status: 'in-progress' },
      { name: 'Voice & interaction', status: 'in-progress' },
      { name: 'Editorial chat (LLM)', status: 'shipped' },
    ],
  },
  {
    medium: 'Vision',
    icon: Frame,
    items: [
      { name: 'Graphic novel layout', status: 'reserved' },
      { name: 'Storyboard & keyframes', status: 'reserved' },
      { name: 'Animatic & timing', status: 'reserved' },
      { name: 'Visual style / NPR', status: 'reserved' },
      { name: 'Scene graph engine', status: 'reserved' },
    ],
  },
  {
    medium: 'Output',
    icon: Wand2,
    items: [
      { name: 'Render tools', status: 'in-progress' },
      { name: 'Integration & API layer', status: 'shipped' },
      { name: 'Plugin registry (17)', status: 'shipped' },
    ],
  },
]

const ATELIER: AtelierLink[] = [
  {
    num: '01',
    title: 'Settings',
    blurb: 'Account, books, services, editorial, integrations — every dial.',
    href: '/settings',
  },
  {
    num: '02',
    title: 'Services',
    blurb: 'Capability slots — TTS, STT, image, music, LLM — local or routed.',
    href: '/settings#services',
  },
  {
    num: '03',
    title: 'Plugins',
    blurb: '17 plugin manifests covering 9 local tools + 8 cloud APIs.',
    href: '/settings#integrations',
  },
  {
    num: '04',
    title: 'Inference Studio',
    blurb: 'Raw API exploration — TTS, STT, image, music. Not chapter-aware.',
    href: '/inference',
  },
]

export default function HomePage() {
  const navigate = useNavigate()
  const [books, setBooks] = useState<BookEntry[]>([])
  const [graphs, setGraphs] = useState<Record<string, ProductionGraphSummary>>({})
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({
    id: '',
    title: '',
    bookRoot: '',
    audioRoot: '',
  })
  const [error, setError] = useState('')
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null)
  const [clock, setClock] = useState(() => new Date())
  const [healthCount, setHealthCount] = useState(0)

  const mode = useThemePrefs((s) => s.mode)
  const setMode = useThemePrefs((s) => s.setMode)

  // Two-stage load: first the book registry (cheap), then each book's
  // production graph in parallel (richer; lazy-scaffolds on first call).
  // We don't block on graphs — production slates render the registry
  // fields immediately and progressively enhance as each graph arrives.
  useEffect(() => {
    let cancelled = false
    fetch('/api/books')
      .then((r) => r.json())
      .then((data: BookEntry[]) => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : []
        setBooks(list)
        setLoading(false)
        // Fan out: one graph per book. Promise.allSettled so a slow or
        // failing graph doesn't block the others from rendering.
        Promise.allSettled(
          list.map((b) =>
            fetch(`/api/books/${encodeURIComponent(b.id)}/graph`)
              .then((r) => (r.ok ? r.json() : null))
              .then((g: ProductionGraphSummary | null) => ({ id: b.id, graph: g }))
              .catch(() => ({ id: b.id, graph: null })),
          ),
        ).then((results) => {
          if (cancelled) return
          setGraphs((prev) => {
            const next = { ...prev }
            for (const r of results) {
              if (r.status === 'fulfilled' && r.value.graph) {
                next[r.value.id] = r.value.graph
              }
            }
            return next
          })
        })
      })
      .catch(() => setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Background-poll health for the reel. Cheap — every 30s.
  useEffect(() => {
    let cancelled = false
    const tick = () => {
      fetch('/api/health')
        .then((r) => (r.ok ? r.json() : null))
        .then(() => {
          if (!cancelled) setHealthCount((n) => n + 1)
        })
        .catch(() => {})
    }
    tick()
    const t = setInterval(tick, 30_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  // Discover audio-root for the book being added (mirrors LibraryPage).
  useEffect(() => {
    if (!form.bookRoot || !form.bookRoot.startsWith('/')) {
      setDiscovery(null)
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/books/discover-audio-root', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookRoot: form.bookRoot }),
        })
        const data = (await r.json()) as DiscoveryResult
        if (cancelled) return
        if (!r.ok) {
          setDiscovery(null)
          return
        }
        setDiscovery(data)
        if (data.audioRoot && !form.audioRoot) {
          setForm((f) => (f.audioRoot ? f : { ...f, audioRoot: data.audioRoot ?? '' }))
        }
      } catch {
        if (!cancelled) setDiscovery(null)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.bookRoot])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const r = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await r.json()
      if (!r.ok) {
        setError(data.error || 'Failed to add book')
        return
      }
      setBooks((prev) => [...prev, data])
      setAdding(false)
      setForm({ id: '', title: '', bookRoot: '', audioRoot: '' })
      setDiscovery(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleRemove = async (bookId: string) => {
    const t = books.find((b) => b.id === bookId)?.title
    if (!confirm(`Remove "${t}" from the library?`)) return
    try {
      await fetch(`/api/books/${bookId}`, { method: 'DELETE' })
      setBooks((prev) => prev.filter((b) => b.id !== bookId))
    } catch {
      /* ignore */
    }
  }

  const deriveId = (title: string) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

  // Counts come from the graph when available, else fall back to the
  // book registry's pre-graph chapter_count. While graphs are still
  // loading, the registry numbers are honest — they're what we know.
  const totalChapters = useMemo(
    () =>
      books.reduce((n, b) => {
        const g = graphs[b.id]
        if (g?.scaffolded && g.narrativeUnits) {
          // Subtract 1 for the book-root narrative unit; chapters are
          // the kind === 'chapter' subset.
          const chapters = g.narrativeUnits.filter((u) => u.kind === 'chapter').length
          return n + chapters
        }
        return n + (b.chapter_count ?? 0)
      }, 0),
    [books, graphs],
  )

  const totalAssets = useMemo(
    () =>
      Object.values(graphs).reduce(
        (n, g) => n + (g?.scaffolded ? (g.assets?.length ?? 0) : 0),
        0,
      ),
    [graphs],
  )

  const todayLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    })
    return fmt.format(clock)
  }, [clock])

  const clockLabel = useMemo(() => {
    return clock.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }, [clock])

  return (
    <div className="galley-home">
      <Masthead
        todayLabel={todayLabel}
        mode={mode}
        toggleMode={() => setMode(mode === 'dark' ? 'light' : 'dark')}
      />
      <FilmLeader />

      <section className="gh-hero">
        <div className="gh-hero-text">
          <p className="gh-hero-eyebrow">A local-first editorial atelier</p>
          <h1 className="gh-hero-title">
            Make the <em>book</em>, the audio, the <em>scene</em>.
          </h1>
          <p className="gh-hero-lede">
            Galley brings prose, audiobook, and visual production into one
            studio. The device is the truth; the network is an optimisation.
            Twelve capability families — prose, story bible, script,
            audiobook, graphic novel, storyboard, animatic, visual style,
            scene graph, voice, output, integrations — all under your hand.
          </p>
        </div>
        <div className="gh-hero-stats">
          <div className="gh-stat">
            <span className="gh-stat-num">{books.length.toString().padStart(2, '0')}</span>
            <span className="gh-stat-label">Productions</span>
          </div>
          <div className="gh-stat">
            <span className="gh-stat-num">{totalChapters}</span>
            <span className="gh-stat-label">Chapters in-flight</span>
          </div>
          {totalAssets > 0 && (
            <div className="gh-stat">
              <span className="gh-stat-num">{totalAssets}</span>
              <span className="gh-stat-label">Assets tracked</span>
            </div>
          )}
        </div>
      </section>

      {/* ── Act I — Productions ── */}
      <section className="gh-act gh-act-productions">
        <header className="gh-act-head">
          <span className="gh-act-numeral">I.</span>
          <h2 className="gh-act-title">Productions</h2>
          <button className="gh-act-action" onClick={() => setAdding(true)}>
            <span>+</span> New production
          </button>
        </header>

        {loading ? (
          <div className="gh-empty-state">Loading the library…</div>
        ) : books.length === 0 ? (
          <div className="gh-empty-state">
            No productions in the slate. Begin one to make the studio yours.
          </div>
        ) : (
          <div className="gh-productions">
            {books.map((book, i) => (
              <ProductionSlate
                key={book.id}
                book={book}
                graph={graphs[book.id]}
                slateNo={i + 1}
                onOpen={() => navigate(`/read/${book.id}`)}
                onRemove={() => handleRemove(book.id)}
              />
            ))}
            <button className="gh-slate gh-slate-new" onClick={() => setAdding(true)}>
              <span className="gh-slate-mark">
                <span className="gh-slate-mark-no">NEW · SLATE</span>
                <span>↗</span>
              </span>
              <span className="gh-slate-new-plus">+</span>
              <span className="gh-slate-new-label">Begin a new production</span>
              <span className="gh-slate-new-hint">Add book · ⌘N</span>
            </button>
          </div>
        )}
      </section>

      {/* ── Act II — Workshops ── */}
      <section className="gh-act gh-act-workshops">
        <header className="gh-act-head">
          <span className="gh-act-numeral">II.</span>
          <h2 className="gh-act-title">Workshops</h2>
          <span className="gh-act-sub">Twelve capability families</span>
        </header>
        <div className="gh-workshops">
          {WORKSHOPS.map((w) => (
            <WorkshopCard key={w.medium} workshop={w} />
          ))}
        </div>
      </section>

      {/* ── Act III — Atelier ── */}
      <section className="gh-act gh-act-atelier">
        <header className="gh-act-head">
          <span className="gh-act-numeral">III.</span>
          <h2 className="gh-act-title">Atelier</h2>
          <span className="gh-act-sub">The room behind the room</span>
        </header>
        <div className="gh-atelier">
          {ATELIER.map((a) => (
            <Link key={a.num} className="gh-atelier-link" to={a.href}>
              <span className="gh-atelier-num">{a.num} · </span>
              <h3 className="gh-atelier-title">{a.title}</h3>
              <p className="gh-atelier-blurb">{a.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <SystemReel healthCount={healthCount} clockLabel={clockLabel} />

      {adding && (
        <AddProductionDialog
          form={form}
          discovery={discovery}
          error={error}
          onChange={setForm}
          onDeriveId={deriveId}
          onSubmit={handleAdd}
          onClose={() => {
            setAdding(false)
            setError('')
            setDiscovery(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Masthead + film leader ────────────────────────────────────────────

function Masthead({
  todayLabel,
  mode,
  toggleMode,
}: {
  todayLabel: string
  mode: 'light' | 'dark' | 'auto'
  toggleMode: () => void
}) {
  return (
    <header className="gh-masthead">
      <div className="gh-mast-left">
        <Link to="/" className="gh-wordmark" aria-label="Galley">
          Galley
        </Link>
        <span className="gh-wordmark-version">v0.1 · atelier</span>
      </div>
      <div className="gh-mast-center">
        <strong>{todayLabel}</strong> · session 001
      </div>
      <div className="gh-mast-right">
        <button
          type="button"
          className="gh-mast-icon-btn"
          onClick={toggleMode}
          title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
          aria-label="Toggle theme"
        >
          {mode === 'dark' ? <SunMedium size={16} /> : <Moon size={16} />}
        </button>
        <Link to="/settings" className="gh-mast-icon-btn" title="Settings" aria-label="Settings">
          <Settings size={16} />
        </Link>
        <Link to="/settings#account" className="gh-mast-profile" aria-label="Account">
          <span className="gh-mast-avatar">A</span>
          <span>Auteur</span>
          <CircleUser size={14} aria-hidden="true" />
        </Link>
      </div>
    </header>
  )
}

function FilmLeader() {
  const frames = ['REEL 001', 'EDIT 002', 'TAKE 003', 'SCENE 004', 'CUT 005', 'PRINT 006', 'PICTURE LOCK 007']
  return (
    <div className="gh-leader" aria-hidden="true">
      {frames.map((f, i) => (
        <span key={i} className="gh-leader-frame">
          {f}
        </span>
      ))}
      <span className="gh-leader-spacer" />
      <span className="gh-leader-frame">© the auteur · device is truth</span>
    </div>
  )
}

// ─── Production slate ──────────────────────────────────────────────────

function ProductionSlate({
  book,
  graph,
  slateNo,
  onOpen,
  onRemove,
}: {
  book: BookEntry
  graph?: ProductionGraphSummary
  slateNo: number
  onOpen: () => void
  onRemove: () => void
}) {
  // Production-graph data wins over registry data when present. While
  // the graph is still loading, fall back to the registry's chapter
  // count + a "drafting" status — honest about what we know.
  const productionStatus = graph?.production?.status
  const statusClass = statusClassFromProduction(productionStatus)
  const chapterCount = graph?.scaffolded
    ? (graph.narrativeUnits?.filter((u) => u.kind === 'chapter').length ?? 0)
    : (book.chapter_count ?? 0)
  const assetCount = graph?.scaffolded ? (graph.assets?.length ?? 0) : null
  const kind = graph?.production?.kind
  const backend = graph?.production?.versioningBackend

  return (
    <div
      className="gh-slate"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="gh-slate-mark">
        <span className="gh-slate-mark-no">
          SLATE NO. {String(slateNo).padStart(3, '0')}
          {kind && kind !== 'book' ? <> · {kind.toUpperCase()}</> : null}
        </span>
        <span className={`gh-slate-status ${statusClass}`}>
          {productionStatus ? formatStatus(productionStatus) : 'LOADING'}
        </span>
      </div>
      <h3 className="gh-slate-title">{book.title}</h3>
      <div className="gh-slate-meta">
        <span>
          <span className="gh-slate-meta-num">{chapterCount}</span> chapter
          {chapterCount === 1 ? '' : 's'}
        </span>
        {assetCount !== null && (
          <span>
            <span className="gh-slate-meta-num">{assetCount}</span> asset
            {assetCount === 1 ? '' : 's'}
          </span>
        )}
        {book.volumes?.length ? (
          <span>
            <span className="gh-slate-meta-num">{book.volumes.length}</span> vol
            {book.volumes.length === 1 ? '' : 's'}
          </span>
        ) : null}
        {backend && (
          <span className="gh-slate-meta-backend" title="Versioning backend">
            {backend}
          </span>
        )}
      </div>
      <div className="gh-slate-path" title={book.bookRoot}>
        {shortenPath(book.bookRoot)}
      </div>
      <button
        type="button"
        className="gh-slate-remove"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        Strike
      </button>
    </div>
  )
}

/**
 * Map the production graph's `status` enum onto the existing status-pill
 * CSS classes. We deliberately reuse the four classes already styled
 * (shipped / in-progress / planned / reserved) rather than introducing
 * a parallel set keyed to the new vocabulary — fewer moving parts, and
 * the meanings line up:
 *
 *   wrapped, archived → shipped-equivalent (locked / done)
 *   in-production, in-post → in-progress (work happening)
 *   in-development → planned (still scoping)
 */
function statusClassFromProduction(
  status?: ProductionGraphSummary['production'] extends infer T
    ? T extends { status: infer S }
      ? S
      : never
    : never,
): string {
  switch (status) {
    case 'wrapped':
    case 'archived':
      return 'gh-status-shipped'
    case 'in-production':
    case 'in-post':
      return 'gh-status-in-progress'
    case 'in-development':
      return 'gh-status-planned'
    default:
      return 'gh-status-reserved'
  }
}

function formatStatus(s: string): string {
  return s.replace(/-/g, ' ').toUpperCase()
}

function shortenPath(p: string): string {
  if (!p) return ''
  const parts = p.split('/').filter(Boolean)
  if (parts.length <= 3) return p
  return `…/${parts.slice(-3).join('/')}`
}

// ─── Workshop card ─────────────────────────────────────────────────────

type WorkshopStatus = 'shipped' | 'in-progress' | 'planned' | 'reserved'

interface WorkshopItem {
  name: string
  status: WorkshopStatus
}

interface WorkshopGroup {
  medium: string
  icon: typeof PenTool
  items: WorkshopItem[]
}

interface AtelierLink {
  num: string
  title: string
  blurb: string
  href: string
}

function WorkshopCard({ workshop }: { workshop: WorkshopGroup }) {
  const Icon = workshop.icon
  return (
    <article className="gh-workshop">
      <header className="gh-workshop-head">
        <span className="gh-workshop-medium">{workshop.medium}</span>
        <Icon size={18} className="gh-workshop-icon" aria-hidden="true" />
      </header>
      <h3 className="gh-workshop-title">{workshop.medium === 'Output' ? 'Output & integrations' : `The ${workshop.medium.toLowerCase()} workshop`}</h3>
      <ul className="gh-workshop-list">
        {workshop.items.map((item) => (
          <li key={item.name}>
            <span>{item.name}</span>
            <span className={`gh-status gh-status-${item.status}`}>{statusLabel(item.status)}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}

function statusLabel(s: WorkshopStatus): string {
  return s === 'in-progress' ? 'WIP' : s.toUpperCase()
}

// ─── System reel ───────────────────────────────────────────────────────

function SystemReel({ healthCount, clockLabel }: { healthCount: number; clockLabel: string }) {
  // Cheap mock of live slot health — pulses each /api/health round-trip.
  // Real slot status will come from useApiConfig + per-slot probes when we
  // get to track-3 wiring; this is the visual contract.
  const slots = [
    { id: 'tts/fast', state: healthCount > 0 ? 'live' : 'idle' },
    { id: 'tts/quality', state: 'idle' },
    { id: 'stt/fast', state: 'idle' },
    { id: 'image', state: 'idle' },
    { id: 'music', state: 'idle' },
    { id: 'llm', state: 'idle' },
  ] as const

  return (
    <footer className="gh-reel" aria-label="System reel">
      <span className="gh-reel-tag">REEL</span>
      {slots.map((s) => (
        <span key={s.id} className="gh-reel-row">
          <span className={`gh-reel-dot ${s.state}`} aria-hidden="true" />
          {s.id}
        </span>
      ))}
      <span className="gh-reel-clock">{clockLabel}</span>
    </footer>
  )
}

// ─── Add-production dialog ─────────────────────────────────────────────

function AddProductionDialog({
  form,
  discovery,
  error,
  onChange,
  onDeriveId,
  onSubmit,
  onClose,
}: {
  form: { id: string; title: string; bookRoot: string; audioRoot: string }
  discovery: DiscoveryResult | null
  error: string
  onChange: (f: typeof form) => void
  onDeriveId: (title: string) => string
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="gh-dialog-backdrop" onClick={onClose}>
      <div className="gh-dialog" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="gh-dialog-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
        <p className="gh-dialog-eyebrow">NEW PRODUCTION · SLATE</p>
        <h2 className="gh-dialog-title">Begin a new production</h2>

        <form onSubmit={onSubmit}>
          {error && <div className="gh-form-error">{error}</div>}

          <div className="gh-form-field">
            <label htmlFor="gh-title">Title</label>
            <input
              id="gh-title"
              value={form.title}
              onChange={(e) =>
                onChange({
                  ...form,
                  title: e.target.value,
                  id: form.id || onDeriveId(e.target.value),
                })
              }
              placeholder="The Inverted Stack"
              required
            />
          </div>

          <div className="gh-form-field">
            <label htmlFor="gh-id">
              Identifier <span className="gh-form-hint">url-safe slug</span>
            </label>
            <input
              id="gh-id"
              value={form.id}
              onChange={(e) => onChange({ ...form, id: e.target.value })}
              placeholder="my-book"
              pattern="[a-z0-9-]+"
              required
            />
          </div>

          <div className="gh-form-field">
            <label>Book root</label>
            <DirectoryPicker
              value={form.bookRoot}
              onChange={(p: string) => onChange({ ...form, bookRoot: p })}
              placeholder="/Users/you/Projects/my-book"
              required
            />
          </div>

          {discovery && (discovery.chapter_count ?? 0) > 0 && (
            <div className="gh-form-discovery">
              Found <strong>{discovery.chapter_count}</strong> chapter
              {discovery.chapter_count !== 1 ? 's' : ''}
              {discovery.volumes?.length ? <> in {discovery.volumes.join(', ')}</> : null}
              {discovery.audioRoot ? (
                <>
                  {' '}
                  · existing audio at <code>{discovery.audioRoot}</code> (
                  {discovery.matched} match{discovery.matched === 1 ? '' : 'es'}).
                </>
              ) : (
                <> · no existing audio — galley will render to its default.</>
              )}
            </div>
          )}

          <div className="gh-form-field">
            <label>
              Audio root <span className="gh-form-hint">optional · auto-detected</span>
            </label>
            <DirectoryPicker
              value={form.audioRoot}
              onChange={(p: string) => onChange({ ...form, audioRoot: p })}
              placeholder={discovery?.audioRoot || 'Galley default location'}
            />
          </div>

          <div className="gh-form-actions">
            <button type="button" className="gh-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="gh-btn-primary">
              Begin production
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
