import { useState, useRef, useEffect } from 'react'
import type { Track, TrackGenre, TrackMood, SilvermanTrack } from '@galley/api-client'
import { GENRES, MOODS } from '@galley/api-client'
import { useMusicClient } from '@/api/clients'
import { IconX, IconUpload, IconFolder, IconLink } from './icons'

const SOURCE_CHIPS = ['Silverman Sound', 'Incompetech', 'Musopen', 'Other'] as const
type Tab = 'files' | 'url' | 'folder' | 'browse'

interface StagedFile {
  file: File
  title: string
  genre: TrackGenre
  mood: TrackMood
  source: string
}

interface Props {
  onClose: () => void
  onAdd: (tracks: Track[]) => void
}

function fmtSecs(s: number) {
  if (!s) return '--'
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

function IconBrowse({ width = 12, height = 12 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

export function MusicUploadModal({ onClose, onAdd }: Props) {
  const client = useMusicClient()
  const [tab, setTab] = useState<Tab>('files')
  const [staged, setStaged] = useState<StagedFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlSource, setUrlSource] = useState('Other')
  const [urlGenre, setUrlGenre] = useState<TrackGenre>('Ambient')
  const [urlMood, setUrlMood] = useState<TrackMood>('Neutral')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  // Browse tab state
  const [browseItems, setBrowseItems] = useState<SilvermanTrack[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseError, setBrowseError] = useState('')
  const [browseFilter, setBrowseFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (tab === 'browse' && browseItems.length === 0 && !browseLoading) {
      setBrowseLoading(true)
      setBrowseError('')
      client.browseSilverman()
        .then(r => setBrowseItems(r.tracks))
        .catch(e => setBrowseError(e instanceof Error ? e.message : 'Failed to load'))
        .finally(() => setBrowseLoading(false))
    }
  }, [tab, client])

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(f => /\.(mp3|wav|flac|ogg|m4a|aac|opus)$/i.test(f.name))
    setStaged(s => [
      ...s,
      ...arr.map(f => ({
        file: f,
        title: f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
        genre: 'Ambient' as TrackGenre,
        mood: 'Neutral' as TrackMood,
        source: 'Local upload',
      })),
    ])
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  async function submit() {
    if (staged.length === 0) return
    setLoading(true)
    setError('')
    try {
      const res = await client.uploadTracks(
        staged.map(s => s.file),
        { genre: staged[0].genre, mood: staged[0].mood, source: staged[0].source }
      )
      onAdd(res.tracks)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  async function fetchUrl() {
    if (!urlInput.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await client.fetchTrackUrl(urlInput.trim(), urlSource, urlGenre, urlMood)
      onAdd(res.tracks)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      setLoading(false)
    }
  }

  async function importSelected() {
    if (selected.size === 0) return
    setLoading(true)
    setError('')
    try {
      const toImport = browseItems.filter(t => selected.has(t.mp3_url))
      const res = await client.importSilvermanTracks(toImport)
      if (res.imported.length > 0) onAdd(res.imported)
      if (res.errors.length > 0) {
        setError(`${res.errors.length} track(s) failed to import`)
      } else {
        onClose()
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  const filteredBrowse = browseFilter.trim()
    ? browseItems.filter(t =>
        t.title.toLowerCase().includes(browseFilter.toLowerCase()) ||
        t.genre.toLowerCase().includes(browseFilter.toLowerCase()) ||
        t.tags.some(tag => tag.toLowerCase().includes(browseFilter.toLowerCase()))
      )
    : browseItems

  const tabStyle = (t: Tab) => ({
    padding: '10px 14px', fontSize: 13,
    borderBottom: `2px solid ${tab === t ? 'var(--mp-accent)' : 'transparent'}`,
    color: tab === t ? 'var(--mp-fg)' : 'var(--mp-fg-3)',
    transition: 'color 0.12s',
    display: 'flex', alignItems: 'center', gap: 5,
  } as React.CSSProperties)

  return (
    <div
      className="mp-fade-in"
      style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        zIndex: 200,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '90%', maxWidth: 900, maxHeight: '88vh',
        background: 'var(--mp-bg-1)',
        border: '1px solid var(--mp-line-2)',
        borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '14px 20px',
          borderBottom: '1px solid var(--mp-line)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>Add to library</span>
          <button onClick={onClose} style={{ color: 'var(--mp-fg-3)' }}>
            <IconX width={18} height={18} />
          </button>
        </div>

        {/* tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--mp-line)', flexShrink: 0 }}>
          <button style={tabStyle('files')} onClick={() => setTab('files')}><IconUpload width={12} height={12} />Files</button>
          <button style={tabStyle('url')} onClick={() => setTab('url')}><IconLink width={12} height={12} />Paste URL</button>
          <button style={tabStyle('folder')} onClick={() => setTab('folder')}><IconFolder width={12} height={12} />Folder</button>
          <button style={tabStyle('browse')} onClick={() => setTab('browse')}><IconBrowse width={12} height={12} />Browse Silverman</button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: tab === 'browse' ? 0 : 20 }}>
          {(tab === 'files' || tab === 'folder') && (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                style={{
                  border: `1.5px dashed ${dragging ? 'var(--mp-accent)' : 'var(--mp-line-2)'}`,
                  borderRadius: 6,
                  padding: '36px 24px',
                  textAlign: 'center',
                  background: dragging ? 'color-mix(in oklab, var(--mp-accent) 6%, transparent)' : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 12 }}>🎵</div>
                <div style={{ color: 'var(--mp-fg-2)', marginBottom: 12 }}>
                  Drag audio files here, or{' '}
                  <button
                    onClick={() => (tab === 'folder' ? folderRef : fileRef).current?.click()}
                    style={{ color: 'var(--mp-accent)', fontWeight: 600 }}
                  >
                    browse
                  </button>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--mp-fg-4)', fontFamily: 'JetBrains Mono, monospace' }}>
                  MP3 · WAV · FLAC · OGG · M4A · AAC
                </div>
                <input ref={fileRef} type="file" multiple accept=".mp3,.wav,.flac,.ogg,.m4a,.aac,.opus,audio/*" style={{ display: 'none' }} onChange={e => e.target.files && addFiles(e.target.files)} />
                <input ref={folderRef} type="file" {...({ webkitdirectory: '', directory: '', multiple: true } as Record<string, unknown>)} accept=".mp3,.wav,.flac,.ogg,.m4a,.aac,.opus,audio/*" style={{ display: 'none' }} onChange={e => e.target.files && addFiles(e.target.files)} />
              </div>

              {staged.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.1em', color: 'var(--mp-fg-4)', marginBottom: 10 }}>
                    STAGED ({staged.length})
                  </div>
                  {staged.map((s, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 120px 120px 40px', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--mp-line)' }}>
                      <div style={{ width: 24, height: 24, borderRadius: 3, background: 'var(--mp-bg-3)', flexShrink: 0 }} />
                      <input value={s.title} onChange={e => setStaged(arr => arr.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} style={{ background: 'var(--mp-bg-2)', border: '1px solid var(--mp-line)', borderRadius: 3, padding: '4px 8px', color: 'var(--mp-fg)', fontSize: 13, outline: 'none' }} />
                      <select value={s.genre} onChange={e => setStaged(arr => arr.map((x, j) => j === i ? { ...x, genre: e.target.value as TrackGenre } : x))} style={{ background: 'var(--mp-bg-2)', border: '1px solid var(--mp-line)', borderRadius: 3, padding: '4px 6px', color: 'var(--mp-fg-2)', fontSize: 12 }}>
                        {GENRES.map(g => <option key={g}>{g}</option>)}
                      </select>
                      <select value={s.mood} onChange={e => setStaged(arr => arr.map((x, j) => j === i ? { ...x, mood: e.target.value as TrackMood } : x))} style={{ background: 'var(--mp-bg-2)', border: '1px solid var(--mp-line)', borderRadius: 3, padding: '4px 6px', color: 'var(--mp-fg-2)', fontSize: 12 }}>
                        {MOODS.map(m => <option key={m}>{m}</option>)}
                      </select>
                      <button onClick={() => setStaged(arr => arr.filter((_, j) => j !== i))} style={{ color: 'var(--mp-fg-4)', textAlign: 'center' }}>
                        <IconX width={13} height={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'url' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {SOURCE_CHIPS.map(src => (
                  <button key={src} onClick={() => setUrlSource(src)} style={{ padding: '5px 12px', borderRadius: 99, fontSize: 12.5, border: `1px solid ${urlSource === src ? 'var(--mp-accent)' : 'var(--mp-line)'}`, background: urlSource === src ? 'color-mix(in oklab, var(--mp-accent) 12%, transparent)' : 'transparent', color: urlSource === src ? 'var(--mp-accent)' : 'var(--mp-fg-2)' }}>
                    {src}
                  </button>
                ))}
              </div>
              <input value={urlInput} onChange={e => setUrlInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchUrl()} placeholder="https://…" style={{ background: 'var(--mp-bg-2)', border: '1px solid var(--mp-line-2)', borderRadius: 4, padding: '9px 12px', color: 'var(--mp-fg)', fontSize: 13, outline: 'none', width: '100%' }} />
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--mp-fg-4)', marginBottom: 6, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em' }}>GENRE</div>
                  <select value={urlGenre} onChange={e => setUrlGenre(e.target.value as TrackGenre)} style={{ width: '100%', background: 'var(--mp-bg-2)', border: '1px solid var(--mp-line)', borderRadius: 4, padding: '7px 10px', color: 'var(--mp-fg)', fontSize: 13 }}>
                    {GENRES.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--mp-fg-4)', marginBottom: 6, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em' }}>MOOD</div>
                  <select value={urlMood} onChange={e => setUrlMood(e.target.value as TrackMood)} style={{ width: '100%', background: 'var(--mp-bg-2)', border: '1px solid var(--mp-line)', borderRadius: 4, padding: '7px 10px', color: 'var(--mp-fg)', fontSize: 13 }}>
                    {MOODS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {tab === 'browse' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* browse header */}
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--mp-line)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--mp-fg)' }}>Silverman Sound</div>
                  <div style={{ fontSize: 11.5, color: 'var(--mp-fg-3)', marginTop: 2 }}>
                    Free royalty-free music by Shane Ivers · CC BY 4.0
                  </div>
                </div>
                <input
                  placeholder="Filter tracks…"
                  value={browseFilter}
                  onChange={e => setBrowseFilter(e.target.value)}
                  style={{ background: 'var(--mp-bg-2)', border: '1px solid var(--mp-line)', borderRadius: 4, padding: '6px 10px', color: 'var(--mp-fg)', fontSize: 12.5, outline: 'none', width: 180 }}
                />
                {browseItems.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--mp-fg-4)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {filteredBrowse.length} tracks
                  </span>
                )}
              </div>

              {/* column header with select-all */}
              {!browseLoading && !browseError && filteredBrowse.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '36px 36px 1fr 80px 80px 52px', alignItems: 'center', padding: '4px 12px', borderBottom: '1px solid var(--mp-line)', background: 'var(--mp-bg)', position: 'sticky', top: 0, zIndex: 1 }}>
                  {/* select-all checkbox */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    {(() => {
                      const allSelected = filteredBrowse.length > 0 && filteredBrowse.every(t => selected.has(t.mp3_url))
                      const someSelected = !allSelected && filteredBrowse.some(t => selected.has(t.mp3_url))
                      return (
                        <button
                          onClick={() => setSelected(s => {
                            const next = new Set(s)
                            if (allSelected) filteredBrowse.forEach(t => next.delete(t.mp3_url))
                            else filteredBrowse.forEach(t => next.add(t.mp3_url))
                            return next
                          })}
                          title={allSelected ? 'Deselect all' : 'Select all'}
                          style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${allSelected || someSelected ? 'var(--mp-accent)' : 'var(--mp-line-2)'}`, background: allSelected ? 'var(--mp-accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s', cursor: 'pointer' }}
                        >
                          {allSelected && <svg width={9} height={9} viewBox="0 0 10 10" fill="none"><polyline points="1.5,5 4,7.5 8.5,2" stroke="#1a1610" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          {someSelected && <div style={{ width: 6, height: 1.5, background: 'var(--mp-accent)', borderRadius: 1 }} />}
                        </button>
                      )
                    })()}
                  </div>
                  <div />
                  {[['TITLE', '1fr'], ['GENRE', '80px'], ['MOOD', '80px'], ['DUR', '52px']].map(([label]) => (
                    <span key={label} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', color: 'var(--mp-fg-4)', paddingLeft: label === 'TITLE' ? 10 : 0 }}>{label}</span>
                  ))}
                </div>
              )}

              {/* track list */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {browseLoading && (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--mp-fg-3)', fontSize: 13 }}>
                    Loading Silverman Sound catalogue…
                  </div>
                )}
                {browseError && (
                  <div style={{ padding: 20, color: 'var(--mp-danger)', fontSize: 12.5 }}>{browseError}</div>
                )}
                {!browseLoading && !browseError && filteredBrowse.map(t => {
                  const sel = selected.has(t.mp3_url)
                  return (
                    <div
                      key={t.mp3_url}
                      onClick={() => setSelected(s => {
                        const next = new Set(s)
                        sel ? next.delete(t.mp3_url) : next.add(t.mp3_url)
                        return next
                      })}
                      style={{
                        display: 'grid', gridTemplateColumns: '36px 36px 1fr 80px 80px 52px',
                        alignItems: 'center', gap: 0,
                        padding: '6px 12px',
                        borderBottom: '1px solid var(--mp-line)',
                        background: sel ? 'color-mix(in oklab, var(--mp-accent) 8%, transparent)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--mp-bg-2)' }}
                      onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent' }}
                    >
                      {/* checkbox */}
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${sel ? 'var(--mp-accent)' : 'var(--mp-line-2)'}`, background: sel ? 'var(--mp-accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}>
                          {sel && <svg width={9} height={9} viewBox="0 0 10 10" fill="none"><polyline points="1.5,5 4,7.5 8.5,2" stroke="#1a1610" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                      </div>
                      {/* artwork */}
                      <div style={{ width: 28, height: 28, borderRadius: 3, background: 'var(--mp-bg-3)', overflow: 'hidden', flexShrink: 0 }}>
                        {t.artwork_url && <img src={t.artwork_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      </div>
                      {/* title / tags */}
                      <div style={{ paddingLeft: 10, overflow: 'hidden' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mp-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'nowrap', overflow: 'hidden' }}>
                          {t.tags.slice(0, 3).map(tag => (
                            <span key={tag} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, background: 'var(--mp-bg-3)', color: 'var(--mp-fg-4)', padding: '1px 4px', borderRadius: 2, whiteSpace: 'nowrap' }}>{tag}</span>
                          ))}
                        </div>
                      </div>
                      {/* genre */}
                      <div style={{ fontSize: 11.5, color: 'var(--mp-fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{t.genre}</div>
                      {/* mood */}
                      <div style={{ fontSize: 11.5, color: 'var(--mp-fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{t.mood}</div>
                      {/* duration */}
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--mp-fg-4)', textAlign: 'right' }}>{t.duration_str || fmtSecs(t.duration)}</div>
                    </div>
                  )
                })}
              </div>

              {/* attribution notice */}
              <div style={{ padding: '8px 20px', borderTop: '1px solid var(--mp-line)', fontSize: 11, color: 'var(--mp-fg-4)', fontStyle: 'italic', flexShrink: 0 }}>
                Attribution required · Music by Shane Ivers — https://www.silvermansound.com
              </div>
            </div>
          )}
        </div>

        {/* error */}
        {error && (
          <div style={{ padding: '8px 20px', color: 'var(--mp-danger)', fontSize: 12.5, background: 'color-mix(in oklab, var(--mp-danger) 8%, transparent)', flexShrink: 0 }}>
            {error}
          </div>
        )}

        {/* footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--mp-line)', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 4, border: '1px solid var(--mp-line)', color: 'var(--mp-fg-2)', fontSize: 13 }}>
            Cancel
          </button>
          {tab === 'browse' ? (
            <button
              onClick={importSelected}
              disabled={loading || selected.size === 0}
              style={{ padding: '8px 18px', borderRadius: 4, background: 'var(--mp-accent)', color: '#1a1610', fontWeight: 600, fontSize: 13, opacity: (loading || selected.size === 0) ? 0.5 : 1, cursor: (loading || selected.size === 0) ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Downloading…' : `Add ${selected.size > 0 ? selected.size : ''} to library`}
            </button>
          ) : (
            <button
              onClick={tab === 'url' ? fetchUrl : submit}
              disabled={loading || (tab !== 'url' && staged.length === 0)}
              style={{ padding: '8px 18px', borderRadius: 4, background: 'var(--mp-accent)', color: '#1a1610', fontWeight: 600, fontSize: 13, opacity: (loading || (tab !== 'url' && staged.length === 0)) ? 0.5 : 1, cursor: (loading || (tab !== 'url' && staged.length === 0)) ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Working…' : tab === 'url' ? 'Fetch' : `Add ${staged.length} to library`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
