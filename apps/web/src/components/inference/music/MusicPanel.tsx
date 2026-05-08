import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useLocalStorage } from '@/hooks/inference/useLocalStorage'
import type { Track, Section, SortBy, ViewMode, LibraryStats } from '@galley/api-client'
import { MOODS } from '@galley/api-client'
import { useMusicClient } from '@/api/clients'
import { MusicSidebar } from './MusicSidebar'
import { TrackList } from './TrackList'
import { TrackGrid } from './TrackGrid'
import { DetailDrawer } from './DetailDrawer'
import { MusicPlayer } from './MusicPlayer'
import { QueuePanel } from './QueuePanel'
import { MusicUploadModal } from './MusicUploadModal'
import { IconSearch, IconX } from './icons'

const STORAGE_KEY = 'inference-studio.music.queue.v1'

function sectionTitle(s: Section): string {
  if (s === 'all') return 'All Tracks'
  if (s === 'favorites') return 'Favorites'
  if (s.startsWith('source:')) return s.slice(7)
  if (s.startsWith('genre:')) return s.slice(6)
  return 'Library'
}

export function MusicPanel() {
  const client = useMusicClient()

  const [tracks, setTracks] = useState<Track[]>([])
  const [stats, setStats] = useState<LibraryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // browse state — persisted
  const [section, setSection] = useLocalStorage<Section>('is.music.section', 'all')
  const [query, setQuery] = useLocalStorage('is.music.query', '')
  const [moodsArr, setMoodsArr] = useLocalStorage<string[]>('is.music.moods', [])
  const activeMoods = useMemo(() => new Set(moodsArr), [moodsArr])
  const setActiveMoods = useCallback((fn: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setMoodsArr(prev => {
      const next = typeof fn === 'function' ? fn(new Set(prev)) : fn
      return [...next]
    })
  }, [setMoodsArr])
  const [sortBy, setSortBy] = useLocalStorage<SortBy>('is.music.sort', 'added')
  const [view, setView] = useLocalStorage<ViewMode>('is.music.view', 'list')

  // playback
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [queue, setQueue] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
  })
  const [volume, setVolumeState] = useLocalStorage('is.music.volume', 0.8)

  // ui
  const [uploadOpen, setUploadOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [showQueue, setShowQueue] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  // persist queue
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  }, [queue])

  // load tracks
  const loadAll = useCallback(async () => {
    try {
      const [res, s] = await Promise.all([client.listTracks(), client.getStats()])
      setTracks(res.tracks)
      setStats(s)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load library')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => { void loadAll() }, [loadAll])

  // audio element wiring
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const track = tracks.find(t => t.id === currentId)
    if (!track?.file_path) { audio.src = ''; return }
    audio.src = client.trackStreamUrl(track.file_path)
    if (isPlaying) audio.play().catch(() => {})
  }, [currentId, tracks, client])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) audio.play().catch(() => {})
    else audio.pause()
  }, [isPlaying])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onEnded = () => {
      setQueue(q => {
        if (q.length === 0) { setIsPlaying(false); return q }
        const [next, ...rest] = q
        setCurrentId(next)
        setIsPlaying(true)
        return rest
      })
    }
    audio.addEventListener('ended', onEnded)
    return () => audio.removeEventListener('ended', onEnded)
  }, [])

  // filtered + sorted tracks
  const filtered = useMemo(() => {
    let list = tracks
    if (section === 'favorites') {
      list = list.filter(t => t.favorite)
    } else if (section.startsWith('source:')) {
      const src = section.slice(7)
      list = list.filter(t => t.source === src)
    } else if (section.startsWith('genre:')) {
      const g = section.slice(6)
      list = list.filter(t => t.genre === g)
    }
    if (activeMoods.size) list = list.filter(t => activeMoods.has(t.mood))
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.tags.some(tg => tg.toLowerCase().includes(q)) ||
        t.source.toLowerCase().includes(q) ||
        t.genre.toLowerCase().includes(q)
      )
    }
    const cmp: Record<SortBy, (a: Track, b: Track) => number> = {
      added: (a, b) => b.added.localeCompare(a.added),
      title: (a, b) => a.title.localeCompare(b.title),
      artist: (a, b) => a.artist.localeCompare(b.artist),
      duration: (a, b) => a.duration - b.duration,
      plays: (a, b) => b.plays - a.plays,
    }
    return [...list].sort(cmp[sortBy])
  }, [tracks, section, query, activeMoods, sortBy])

  // actions
  const playTrack = useCallback((id: string) => {
    if (id === currentId) {
      setIsPlaying(p => !p)
      return
    }
    setCurrentId(id)
    setIsPlaying(true)
    setTracks(ts => ts.map(t => t.id === id ? { ...t, plays: t.plays + 1 } : t))
    client.incrementPlays(id).catch(() => {})
  }, [currentId, client])

  const togglePlay = useCallback(() => {
    if (!currentId && filtered.length) { playTrack(filtered[0].id); return }
    setIsPlaying(p => !p)
  }, [currentId, filtered, playTrack])

  const toggleFav = useCallback((id: string) => {
    setTracks(ts => ts.map(t => {
      if (t.id !== id) return t
      const next = { ...t, favorite: !t.favorite }
      client.patchTrack(id, { favorite: next.favorite }).then(updated => {
        if (updated) setTracks(all => all.map(x => x.id === id ? updated : x))
        setStats(s => s ? { ...s, favorites: s.favorites + (next.favorite ? 1 : -1) } : s)
      }).catch(() => {})
      return next
    }))
  }, [client])

  const updateTrack = useCallback((id: string, patch: Partial<Track>) => {
    client.patchTrack(id, patch).then(updated => {
      if (updated) setTracks(ts => ts.map(t => t.id === id ? updated : t))
    }).catch(() => {})
    setTracks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t))
  }, [client])

  const enqueue = useCallback((id: string) => setQueue(q => [...q, id]), [])

  const playNext = useCallback(() => {
    setQueue(q => {
      if (!q.length) { setIsPlaying(false); return q }
      const [next, ...rest] = q
      setCurrentId(next)
      setIsPlaying(true)
      return rest
    })
  }, [])

  const playPrev = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    const idx = filtered.findIndex(t => t.id === currentId)
    if (idx > 0) playTrack(filtered[idx - 1].id)
  }, [currentId, filtered, playTrack])

  const seekAudio = useCallback((p: number) => {
    const audio = audioRef.current
    if (audio && audio.duration) audio.currentTime = audio.duration * p
  }, [])

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    if (audioRef.current) audioRef.current.volume = v
  }, [setVolumeState])

  const currentTrack = tracks.find(t => t.id === currentId) ?? null
  const detailTrack = tracks.find(t => t.id === detailId) ?? null

  if (loading) {
    return (
      <div className="music-panel" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--mp-fg-3)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
          Loading library…
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="music-panel" style={{ alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <span style={{ color: 'var(--mp-danger)' }}>{error}</span>
        <button onClick={loadAll} style={{ color: 'var(--mp-accent)', fontSize: 13 }}>Retry</button>
      </div>
    )
  }

  return (
    <div className="music-panel">
      {/* hidden audio element */}
      <audio ref={audioRef} style={{ display: 'none' }} />

      {/* body */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <MusicSidebar
          section={section}
          stats={stats}
          onSection={s => {
            setSection(s)
            if (s === 'all') { setQuery(''); setActiveMoods(new Set()) }
          }}
          onUpload={() => setUploadOpen(true)}
        />

        {/* main area */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--mp-bg)' }}>
          {/* sticky header */}
          <div style={{
            padding: '16px 24px 0',
            background: 'var(--mp-bg)',
            borderBottom: '1px solid var(--mp-line)',
            flexShrink: 0,
          }}>
            {/* title row */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
              <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', margin: 0, color: 'var(--mp-fg)' }}>
                {sectionTitle(section)}
              </h1>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--mp-fg-4)' }}>
                ({filtered.length})
              </span>
            </div>

            {/* search + view toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                flex: '0 0 auto', maxWidth: 480, width: '100%',
                background: 'var(--mp-bg-2)', border: '1px solid var(--mp-line)',
                borderRadius: 4, padding: '7px 10px',
              }}>
                <IconSearch width={14} height={14} style={{ color: 'var(--mp-fg-4)', flexShrink: 0 }} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="search title, artist, tags, source…"
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: 'var(--mp-fg)', fontSize: 13.5, fontStyle: query ? 'normal' : 'italic',
                  }}
                />
                {query && (
                  <button onClick={() => setQuery('')} style={{ color: 'var(--mp-fg-4)', flexShrink: 0 }}>
                    <IconX width={10} height={10} />
                  </button>
                )}
              </div>

              <div style={{
                display: 'flex', gap: 0,
                border: '1px solid var(--mp-line)',
                borderRadius: 4, overflow: 'hidden', flexShrink: 0,
              }}>
                {(['list', 'grid'] as ViewMode[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    style={{
                      padding: '6px 12px',
                      fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                      background: view === v ? 'var(--mp-bg-2)' : 'transparent',
                      color: view === v ? 'var(--mp-fg)' : 'var(--mp-fg-4)',
                      borderRight: v === 'list' ? '1px solid var(--mp-line)' : 'none',
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* mood chips + sort */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.1em', color: 'var(--mp-fg-4)' }}>
                  MOOD
                </span>
                {MOODS.map(m => (
                  <button
                    key={m}
                    onClick={() => setActiveMoods(s => {
                      const n = new Set(s)
                      n.has(m) ? n.delete(m) : n.add(m)
                      return n
                    })}
                    style={{
                      padding: '4px 10px', borderRadius: 99, fontSize: 11.5,
                      border: `1px solid ${activeMoods.has(m) ? 'var(--mp-accent)' : 'var(--mp-line)'}`,
                      background: activeMoods.has(m) ? 'color-mix(in oklab, var(--mp-accent) 12%, transparent)' : 'transparent',
                      color: activeMoods.has(m) ? 'var(--mp-accent)' : 'var(--mp-fg-3)',
                      transition: 'all 0.12s',
                    }}
                  >
                    {m.toLowerCase()}
                  </button>
                ))}
                {activeMoods.size > 0 && (
                  <button
                    onClick={() => setActiveMoods(new Set())}
                    style={{
                      padding: '4px 10px', borderRadius: 99, fontSize: 11.5,
                      border: '1px solid var(--mp-line)',
                      color: 'var(--mp-fg-4)',
                    }}
                  >
                    clear
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.1em', color: 'var(--mp-fg-4)' }}>
                  SORT
                </span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortBy)}
                  style={{
                    background: 'var(--mp-bg-2)', border: '1px solid var(--mp-line)',
                    borderRadius: 4, padding: '5px 8px',
                    color: 'var(--mp-fg-2)', fontSize: 12, outline: 'none',
                  }}
                >
                  <option value="added">date added</option>
                  <option value="title">title</option>
                  <option value="artist">artist</option>
                  <option value="duration">duration</option>
                  <option value="plays">most played</option>
                </select>
              </div>
            </div>
          </div>

          {/* results */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            {filtered.length === 0 ? (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 12,
                color: 'var(--mp-fg-4)',
              }}>
                <span style={{ fontSize: 14 }}>No tracks match.</span>
                <button
                  onClick={() => { setQuery(''); setActiveMoods(new Set()); setSection('all') }}
                  style={{ color: 'var(--mp-accent)', fontSize: 13 }}
                >
                  Reset filters
                </button>
              </div>
            ) : view === 'list' ? (
              <TrackList
                tracks={filtered}
                currentId={currentId}
                isPlaying={isPlaying}
                onPlay={playTrack}
                onFav={toggleFav}
                onQueue={enqueue}
                onDetail={setDetailId}
              />
            ) : (
              <TrackGrid
                tracks={filtered}
                currentId={currentId}
                isPlaying={isPlaying}
                onPlay={playTrack}
                onFav={toggleFav}
                onQueue={enqueue}
                onDetail={setDetailId}
              />
            )}
          </div>
        </main>

        {/* detail drawer */}
        {detailTrack && (
          <DetailDrawer
            track={detailTrack}
            onClose={() => setDetailId(null)}
            onPlay={playTrack}
            onFav={toggleFav}
            onUpdate={patch => updateTrack(detailTrack.id, patch)}
          />
        )}
      </div>

      {/* player */}
      <MusicPlayer
        track={currentTrack}
        isPlaying={isPlaying}
        volume={volume}
        queueLen={queue.length}
        showQueue={showQueue}
        audioRef={audioRef}
        onToggle={togglePlay}
        onPrev={playPrev}
        onNext={playNext}
        onSeek={seekAudio}
        onVolume={setVolume}
        onFav={toggleFav}
        onToggleQueue={() => setShowQueue(s => !s)}
      />

      {/* queue panel */}
      {showQueue && (
        <QueuePanel
          queue={queue}
          tracks={tracks}
          onClose={() => setShowQueue(false)}
          onClear={() => setQueue([])}
          onRemove={idx => setQueue(q => q.filter((_, i) => i !== idx))}
          onPlay={(id, idx) => {
            playTrack(id)
            setQueue(q => q.filter((_, i) => i !== idx))
          }}
        />
      )}

      {/* upload modal */}
      {uploadOpen && (
        <MusicUploadModal
          onClose={() => setUploadOpen(false)}
          onAdd={newTracks => {
            setTracks(ts => [...newTracks, ...ts])
            setStats(s => s ? { ...s, total: s.total + newTracks.length } : s)
          }}
        />
      )}
    </div>
  )
}
