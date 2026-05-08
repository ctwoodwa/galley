import express from 'express'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const LIBRARY_PATH = path.join(__dirname, '../../integrations/library.json')
const DIST_DIR     = process.env.WEB_DIST || path.join(__dirname, '../../apps/web/dist')
const PORT         = parseInt(process.env.PORT || '3080', 10)

// ── Library config ────────────────────────────────────────────────────────────

function loadLibrary() {
  if (fs.existsSync(LIBRARY_PATH)) {
    return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'))
  }
  // Bootstrap from legacy single-book sync.config.json
  const legacyCfg = path.join(__dirname, '../../integrations/the-inverted-stack/sync.config.json')
  if (fs.existsSync(legacyCfg)) {
    const { bookRoot } = JSON.parse(fs.readFileSync(legacyCfg, 'utf8'))
    return { books: [{ id: 'the-inverted-stack', title: 'The Inverted Stack', bookRoot, volumes: [] }] }
  }
  return { books: [] }
}

function saveLibrary(lib) {
  fs.mkdirSync(path.dirname(LIBRARY_PATH), { recursive: true })
  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(lib, null, 2))
}

// ── MP3 tag parsing ───────────────────────────────────────────────────────────

function readMp3TtsTags(mp3Path) {
  try {
    const hdrBuf = Buffer.alloc(10)
    const fd = fs.openSync(mp3Path, 'r')
    const bytesRead = fs.readSync(fd, hdrBuf, 0, 10, 0)
    if (bytesRead < 10 || hdrBuf.slice(0, 3).toString() !== 'ID3') {
      fs.closeSync(fd); return null
    }
    const id3Size = ((hdrBuf[6] & 0x7f) << 21) | ((hdrBuf[7] & 0x7f) << 14) |
                    ((hdrBuf[8] & 0x7f) << 7)   |  (hdrBuf[9] & 0x7f)
    const frameBuf = Buffer.alloc(id3Size)
    fs.readSync(fd, frameBuf, 0, id3Size, 10)
    fs.closeSync(fd)

    const tags = {}
    let pos = 0
    while (pos < id3Size - 10) {
      const frameId = frameBuf.slice(pos, pos + 4).toString('ascii')
      if (frameId === '\x00\x00\x00\x00') break
      const frameSize = frameBuf.readUInt32BE(pos + 4)
      if (frameSize <= 0 || pos + 10 + frameSize > id3Size) break
      if (frameId === 'TXXX') {
        const payload = frameBuf.slice(pos + 10, pos + 10 + frameSize)
        const text = payload.slice(1).toString('utf8').replace(/\x00+$/, '')
        const sep = text.indexOf('\x00')
        if (sep > 0) tags[text.slice(0, sep)] = text.slice(sep + 1)
      }
      pos += 10 + frameSize
    }
    if (!tags['TTS-Engine']) return null
    return {
      engine:       tags['TTS-Engine'],
      preset:       tags['TTS-Preset']       || null,
      voice:        tags['TTS-Voice']        || null,
      speed:        tags['TTS-Speed']        != null ? parseFloat(tags['TTS-Speed'])        : null,
      per_sentence: tags['TTS-Mode'] === 'sentence',
      exaggeration: tags['TTS-Exaggeration'] != null ? parseFloat(tags['TTS-Exaggeration']) : null,
      cfg_weight:   tags['TTS-CfgWeight']    != null ? parseFloat(tags['TTS-CfgWeight'])    : null,
      temperature:  tags['TTS-Temperature']  != null ? parseFloat(tags['TTS-Temperature'])  : null,
    }
  } catch { return null }
}

function loadMp3Tags(audioDir, volumes) {
  const out = {}
  for (const vol of volumes) {
    const dir = path.join(audioDir, vol)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.mp3')) continue
      const key = f.replace(/\.mp3$/, '')
      const tags = readMp3TtsTags(path.join(dir, f))
      if (tags) out[key] = tags
    }
  }
  return out
}

function loadSidecars(audioDir, volumes) {
  const out = {}
  for (const vol of volumes) {
    const dir = path.join(audioDir, vol)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.meta.json')) continue
      try {
        const slug = f.replace('.meta.json', '')
        out[slug] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
      } catch {}
    }
  }
  return out
}

function writeSidecar(audioPath, meta) {
  const sidecarPath = audioPath.replace(/\.mp3$/, '.meta.json')
  try {
    fs.writeFileSync(sidecarPath, JSON.stringify(meta, null, 2))
  } catch (e) {
    console.error('[sidecar] write failed:', sidecarPath, e.message)
  }
}

function loadManifest(audioDir) {
  const p = path.join(audioDir, 'manifest.json')
  if (!fs.existsSync(p)) return {}
  try {
    const { chapters = [] } = JSON.parse(fs.readFileSync(p, 'utf8'))
    const out = {}
    for (const ch of chapters) {
      const slug = path.basename(ch.source || '', '.md')
      if (!slug) continue
      out[slug] = {
        engine:       ch.engine       ?? 'kokoro',
        preset:       ch.preset       ?? 'male',
        voice:        ch.voice        ?? '',
        speed:        ch.speed        ?? null,
        exaggeration: ch.exaggeration ?? null,
        cfg_weight:   ch.cfg_weight   ?? null,
        temperature:  ch.temperature  ?? null,
        per_sentence: ch.mode === 'sentence',
      }
    }
    return out
  } catch { return {} }
}

function loadChapterPresetMap(bookRoot) {
  try {
    const src = fs.readFileSync(path.join(bookRoot, 'build', 'audiobook.py'), 'utf8')
    const block = src.match(/CHAPTER_PRESET_MAP[^=]*=\s*\{([\s\S]*?)\n\}/)
    if (!block) return {}
    const map = {}
    const re = /^\s*"([^"]+)"\s*:\s*"([^"]+)"/gm
    let m
    while ((m = re.exec(block[1])) !== null) map[m[1]] = m[2]
    return map
  } catch { return {} }
}

// ── Chapter catalog ───────────────────────────────────────────────────────────

function extractTitle(stem, filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (yamlMatch) {
      const titleLine = yamlMatch[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)
      if (titleLine) return titleLine[1].trim()
    }
    const headingMatch = content.match(/^# (.+)$/m)
    if (headingMatch) return headingMatch[1].replace(/<!--.*?-->/g, '').trim()
  } catch {}
  return stem
    .replace(/^ch(\d+)-/, 'Ch $1: ')
    .replace(/^appendix-([a-z])-/, (_, l) => `Appendix ${l.toUpperCase()}: `)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
}

function buildCatalog(book) {
  const { bookRoot, volumes = [] } = book
  const chaptersDir = path.join(bookRoot, 'chapters')
  const audioDir    = path.join(bookRoot, 'build', 'output', 'audiobook')

  const volIds = volumes.map(v => v.id)

  // Pre-scan each volume's audio dir once
  const volFiles = {}
  for (const vol of volIds) {
    const dir = path.join(audioDir, vol)
    volFiles[vol] = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  }

  const chapters = []

  if (volumes.length > 0) {
    // Structured scan using declared sections
    for (const vol of volumes) {
      for (const section of vol.sections || []) {
        const sectionDir = path.join(chaptersDir, section.dir)
        if (!fs.existsSync(sectionDir)) continue
        for (const file of fs.readdirSync(sectionDir).filter(f => f.endsWith('.md')).sort()) {
          const stem = file.replace('.md', '')
          const audioFiles = (volFiles[vol.id] || []).filter(f =>
            f.endsWith('.mp3') && f.startsWith(stem) && !f.includes('__')
          )
          chapters.push({
            id: `${vol.id}-${stem}`,
            slug: stem,
            volume: vol.id,
            section: section.group,
            section_label: section.label,
            source_path: path.join('chapters', section.dir, file),
            audio_path: path.join(audioDir, vol.id, `${stem}.mp3`),
            audio_files: audioFiles,
            has_audio: audioFiles.length > 0,
            title: extractTitle(stem, path.join(sectionDir, file)),
          })
        }
      }
    }
  } else {
    // Auto-detect: flat recursive scan of chapters/
    if (!fs.existsSync(chaptersDir)) return chapters
    const scanDir = (dir, relDir) => {
      for (const entry of fs.readdirSync(dir).sort()) {
        const full = path.join(dir, entry)
        const rel  = path.join(relDir, entry)
        if (fs.statSync(full).isDirectory()) {
          scanDir(full, rel)
        } else if (entry.endsWith('.md')) {
          const stem = entry.replace('.md', '')
          const volId = relDir.startsWith('vol-') ? relDir.split('/')[0] : 'vol-1'
          const audioFiles = (volFiles[volId] || []).filter(f =>
            f.endsWith('.mp3') && f.startsWith(stem) && !f.includes('__')
          )
          chapters.push({
            id: `${volId}-${stem}`,
            slug: stem,
            volume: volId,
            section: relDir || 'main',
            section_label: relDir || 'Main',
            source_path: path.join('chapters', rel),
            audio_path: path.join(audioDir, volId, `${stem}.mp3`),
            audio_files: audioFiles,
            has_audio: audioFiles.length > 0,
            title: extractTitle(stem, full),
          })
        }
      }
    }
    scanDir(chaptersDir, '')
  }

  return chapters
}

// ── Per-book runtime state ────────────────────────────────────────────────────

const bookData = new Map()

function initBook(book) {
  const { id, bookRoot, volumes = [] } = book
  const audioDir   = path.join(bookRoot, 'build', 'output', 'audiobook')
  const volIds     = volumes.map(v => v.id)
  const logDir     = path.join(audioDir, '_logs')
  const chaptersDir = path.join(bookRoot, 'chapters')

  const chapters       = buildCatalog(book)
  const chapterPresetMap = loadChapterPresetMap(bookRoot)
  const manifestDefaults = loadManifest(audioDir)
  const sidecarDefaults  = loadSidecars(audioDir, volIds.length ? volIds : ['vol-1', 'vol-2'])
  const mp3TagDefaults   = loadMp3Tags(audioDir, volIds.length ? volIds : ['vol-1', 'vol-2'])

  const reviewSessionFile = path.join(bookRoot, 'build', 'output', 'review-session.json')
  let reviewSession
  try {
    reviewSession = fs.existsSync(reviewSessionFile)
      ? JSON.parse(fs.readFileSync(reviewSessionFile, 'utf8'))
      : newSession()
  } catch { reviewSession = newSession() }

  bookData.set(id, {
    book, chaptersDir, audioDir, logDir, volIds,
    chapters, chapterPresetMap, manifestDefaults, sidecarDefaults, mp3TagDefaults,
    reviewSession, reviewSessionFile,
    paoInboxDir: path.join(bookRoot, '.pao-inbox'),
  })

  console.log(`[book] ${id}: ${chapters.length} chapters loaded`)
  return bookData.get(id)
}

function getBook(bookId) {
  return bookData.get(bookId) || null
}

function findChapterAcrossBooks(chapterId) {
  for (const [bookId, data] of bookData) {
    const ch = data.chapters.find(c => c.id === chapterId)
    if (ch) return { bookId, data, chapter: ch }
  }
  return null
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

let library = loadLibrary()
for (const book of library.books) {
  try { initBook(book) }
  catch (e) { console.error(`[book] failed to init "${book.id}":`, e.message) }
}

// ── SSE broadcast ─────────────────────────────────────────────────────────────

const sseClients = new Set()

function broadcast(event, data = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    try { client.write(payload) } catch {}
  }
}

// ── File watching ─────────────────────────────────────────────────────────────

const rebuildTimers = new Map()

function scheduleRebuild(bookId, reason) {
  if (rebuildTimers.has(bookId)) clearTimeout(rebuildTimers.get(bookId))
  rebuildTimers.set(bookId, setTimeout(() => {
    const data = bookData.get(bookId)
    if (!data) return
    data.chapters = buildCatalog(data.book)
    const withAudio = data.chapters.filter(c => c.has_audio).length
    console.log(`[watch:${bookId}] ${reason} → ${data.chapters.length} chapters, ${withAudio} with audio`)
    broadcast('catalog-updated', { bookId, total: data.chapters.length, with_audio: withAudio })
  }, 400))
}

function watchBook(bookId, data) {
  const { chaptersDir, audioDir, book, volIds } = data

  if (fs.existsSync(chaptersDir)) {
    fs.watch(chaptersDir, { recursive: true }, (event, filename) => {
      if (filename && filename.endsWith('.md')) scheduleRebuild(bookId, `chapters/${filename} ${event}`)
    })
  }

  fs.mkdirSync(audioDir, { recursive: true })
  fs.watch(audioDir, { recursive: true }, (event, filename) => {
    if (!filename) return
    const d = bookData.get(bookId)
    if (!d) return
    if (filename === 'manifest.json') {
      d.manifestDefaults = loadManifest(audioDir)
      console.log(`[watch:${bookId}] manifest updated`)
    } else if (filename.endsWith('.meta.json')) {
      d.sidecarDefaults = loadSidecars(audioDir, volIds.length ? volIds : ['vol-1', 'vol-2'])
      console.log(`[watch:${bookId}] sidecars updated`)
    } else if (filename.endsWith('.mp3') && !filename.includes('_chunk_cache')) {
      d.mp3TagDefaults = loadMp3Tags(audioDir, volIds.length ? volIds : ['vol-1', 'vol-2'])
      scheduleRebuild(bookId, `audio/${filename} ${event}`)
    }
  })

  const audiobookPy = path.join(book.bookRoot, 'build', 'audiobook.py')
  if (fs.existsSync(audiobookPy)) {
    fs.watch(audiobookPy, () => {
      const d = bookData.get(bookId)
      if (d) { d.chapterPresetMap = loadChapterPresetMap(book.bookRoot) }
      console.log(`[watch:${bookId}] audiobook.py updated`)
    })
  }
}

for (const [bookId, data] of bookData) watchBook(bookId, data)

// ── In-memory job registry ────────────────────────────────────────────────────

const jobs = new Map()

function startGeneration(chapterId, options = {}, onFinish) {
  const found = findChapterAcrossBooks(chapterId)
  if (!found) throw new Error(`Chapter not found: ${chapterId}`)
  const { bookId, data, chapter } = found

  fs.mkdirSync(data.logDir, { recursive: true })
  const ts      = Date.now()
  const logFile = path.join(data.logDir, `${chapter.slug}-web-${ts}.log`)

  const args = ['build/audiobook.py', '--only', chapter.slug]
  args.push('--engine', options.engine || 'kokoro')
  if (options.preset)               args.push('--preset', options.preset)
  if (options.voice)                args.push('--voice', options.voice)
  if (options.speed != null)        args.push('--speed', String(options.speed))
  if (options.exaggeration != null) args.push('--exaggeration', String(options.exaggeration))
  if (options.cfg_weight != null)   args.push('--cfg-weight', String(options.cfg_weight))
  if (options.temperature != null)  args.push('--temperature', String(options.temperature))
  if (options.base_url)             args.push('--base-url', options.base_url)
  if (options.api_key)              args.push('--api-key', options.api_key)
  if (options.force)                args.push('--force')
  if (options.per_sentence)         args.push('--per-sentence')
  if (options.no_chapter_map)       args.push('--no-chapter-map')
  if (options.output_suffix)        args.push('--output-suffix', options.output_suffix)

  const env = { ...process.env }
  if (options.api_key) env.TTS_API_KEY = options.api_key

  const logStream = fs.createWriteStream(logFile)
  const proc = spawn('python3', args, {
    cwd: data.book.bookRoot,
    detached: true,
    stdio: ['ignore', logStream, logStream],
    env,
  })
  proc.unref()

  const jobId = `job-${ts}`
  const job = {
    id: jobId,
    status: 'running',
    chapter_id: chapterId,
    chapter_slug: chapter.slug,
    book_id: bookId,
    started: new Date().toISOString(),
    log_file: logFile,
    pid: proc.pid,
    exit_code: null,
  }
  jobs.set(jobId, job)

  proc.on('close', code => {
    job.status = code === 0 ? 'done' : 'failed'
    job.exit_code = code
    job.finished = new Date().toISOString()
    if (code === 0) {
      const meta = {
        engine:       options.engine || 'kokoro',
        preset:       options.preset || 'male',
        voice:        options.voice  || null,
        speed:        options.speed  ?? null,
        per_sentence: options.per_sentence ?? false,
        exaggeration: options.exaggeration ?? null,
        cfg_weight:   options.cfg_weight   ?? null,
        temperature:  options.temperature  ?? null,
        generated_at: job.finished,
        source:       'web-ui',
      }
      writeSidecar(chapter.audio_path + (options.output_suffix || ''), meta)
      const d = bookData.get(bookId)
      if (d) d.sidecarDefaults[chapter.slug] = meta
    }
    broadcast('job-done', { job_id: jobId, chapter_id: chapterId, status: job.status })
    if (typeof onFinish === 'function') onFinish(job)
  })

  return job
}

// ── Job queue ─────────────────────────────────────────────────────────────────

const stagedQueue = []
const jobQueue    = []
let activeQueueItem = null
const queueHistory  = []
const QUEUE_HISTORY_MAX = 30
let batchTotal = 0
let batchDone  = 0

function serializeQueue() {
  return {
    active:  activeQueueItem ? { ...activeQueueItem, job: jobs.get(activeQueueItem.job_id) || null } : null,
    queue:   [...jobQueue],
    staged:  [...stagedQueue],
    history: queueHistory.slice(0, 10),
    batch:   batchTotal > 0 ? { total: batchTotal, done: batchDone } : null,
  }
}

function processNextInQueue() {
  if (activeQueueItem || jobQueue.length === 0) return
  const item = jobQueue.shift()
  item.status = 'running'
  item.started_at = new Date().toISOString()
  activeQueueItem = item
  broadcast('queue-updated', serializeQueue())
  try {
    const job = startGeneration(item.chapter_id, item.options, (finishedJob) => {
      item.status = finishedJob.status
      item.job_id = finishedJob.id
      item.finished_at = finishedJob.finished
      queueHistory.unshift({ ...item })
      if (queueHistory.length > QUEUE_HISTORY_MAX) queueHistory.pop()
      batchDone++
      activeQueueItem = null
      broadcast('queue-updated', serializeQueue())
      processNextInQueue()
    })
    item.job_id = job.id
  } catch (e) {
    item.status = 'failed'
    item.error = e.message
    item.finished_at = new Date().toISOString()
    queueHistory.unshift({ ...item })
    activeQueueItem = null
    broadcast('queue-updated', serializeQueue())
    processNextInQueue()
  }
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())

// ── SSE ───────────────────────────────────────────────────────────────────────

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()
  res.write('event: connected\ndata: {}\n\n')
  const keepalive = setInterval(() => { try { res.write(': ping\n\n') } catch {} }, 25000)
  sseClients.add(res)
  req.on('close', () => { sseClients.delete(res); clearInterval(keepalive) })
})

// ── Books CRUD ────────────────────────────────────────────────────────────────

app.get('/api/books', (_req, res) => {
  res.json(library.books.map(b => ({
    id: b.id,
    title: b.title,
    bookRoot: b.bookRoot,
    volumes: (b.volumes || []).map(v => ({ id: v.id, label: v.label })),
    chapter_count: bookData.get(b.id)?.chapters.length ?? 0,
  })))
})

app.post('/api/books', (req, res) => {
  const { id, title, bookRoot } = req.body
  if (!id || !title || !bookRoot) {
    return res.status(400).json({ error: 'id, title, and bookRoot are required' })
  }
  if (library.books.find(b => b.id === id)) {
    return res.status(409).json({ error: `Book "${id}" already exists` })
  }
  if (!fs.existsSync(bookRoot)) {
    return res.status(400).json({ error: `bookRoot does not exist: ${bookRoot}` })
  }
  const book = { id, title, bookRoot, volumes: [] }
  library.books.push(book)
  saveLibrary(library)
  try {
    const data = initBook(book)
    watchBook(id, data)
  } catch (e) {
    console.error(`[book] init failed for "${id}":`, e.message)
  }
  res.json({ id, title, bookRoot, chapter_count: bookData.get(id)?.chapters.length ?? 0 })
})

app.delete('/api/books/:bookId', (req, res) => {
  const { bookId } = req.params
  const idx = library.books.findIndex(b => b.id === bookId)
  if (idx === -1) return res.status(404).json({ error: 'Book not found' })
  library.books.splice(idx, 1)
  saveLibrary(library)
  bookData.delete(bookId)
  res.json({ deleted: bookId })
})

// ── Book-scoped: chapters ─────────────────────────────────────────────────────

function chapterListResponse(data) {
  const { chapters, chapterPresetMap, manifestDefaults, sidecarDefaults, mp3TagDefaults } = data
  return chapters.map(ch => {
    const relPath = ch.source_path.replace(/^chapters\//, '').replace(/\.md$/, '')
    const tracks = ch.audio_files.map(filename => {
      const fileKey = filename.replace(/\.mp3$/, '')
      const stem    = ch.slug
      let key
      if (filename === `${stem}.mp3`) {
        key = 'primary'
      } else {
        const m = filename.match(new RegExp(`^${stem}--(.+)\\.mp3$`))
        key = m ? m[1] : fileKey
      }
      const tags = mp3TagDefaults[fileKey] ?? null
      return {
        key,
        url: `/api/books/${data.book.id}/audio/${ch.volume}/${filename}`,
        engine:       tags?.engine       ?? null,
        preset:       tags?.preset       ?? null,
        voice:        tags?.voice        ?? null,
        speed:        tags?.speed        ?? null,
        per_sentence: tags?.per_sentence ?? false,
      }
    })

    const info = mp3TagDefaults[ch.slug]
              ?? sidecarDefaults[ch.slug]
              ?? manifestDefaults[ch.slug]
              ?? null
    const plannedPreset = !info
      ? (chapterPresetMap[ch.slug] ?? chapterPresetMap[relPath] ?? null)
      : null

    return {
      id: ch.id,
      slug: ch.slug,
      title: ch.title,
      volume: ch.volume,
      section: ch.section,
      section_label: ch.section_label,
      has_audio: ch.has_audio,
      tracks,
      audio_info: tracks.length > 0 && tracks[0].engine ? {
        engine: tracks[0].engine, preset: tracks[0].preset, voice: tracks[0].voice || null,
        speed: tracks[0].speed, per_sentence: tracks[0].per_sentence,
        exaggeration: info?.exaggeration ?? null,
      } : (info ? {
        engine: info.engine, preset: info.preset, voice: info.voice || null,
        speed: info.speed, per_sentence: info.per_sentence, exaggeration: info.exaggeration,
      } : null),
      planned_preset: plannedPreset,
    }
  })
}

app.get('/api/books/:bookId/chapters', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  res.json(chapterListResponse(data))
})

app.get('/api/books/:bookId/chapters/:id/content', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const chapter = data.chapters.find(c => c.id === req.params.id)
  if (!chapter) return res.status(404).json({ error: 'Chapter not found' })
  try {
    const content = fs.readFileSync(path.join(data.book.bookRoot, chapter.source_path), 'utf8')
    res.json({ content })
  } catch {
    res.status(500).json({ error: 'Failed to read chapter' })
  }
})

app.get('/api/books/:bookId/chapters/:id/alignment', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const chapter = data.chapters.find(c => c.id === req.params.id)
  if (!chapter) return res.status(404).json({ error: 'Chapter not found' })
  const alignPath = path.join(data.chaptersDir, '_voice-drafts', '_alignments', `${chapter.slug}.json`)
  try {
    const alignData = JSON.parse(fs.readFileSync(alignPath, 'utf8'))
    const alignMtime = fs.statSync(alignPath).mtimeMs
    let stale = false
    try {
      const mp3Mtime = fs.statSync(chapter.audio_path).mtimeMs
      stale = mp3Mtime - alignMtime > 3600_000
    } catch {}
    res.json({ ...alignData, stale })
  } catch {
    res.status(404).json({ error: 'No alignment data' })
  }
})

app.get('/api/books/:bookId/chapters/:id/render-defaults', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const chapter = data.chapters.find(c => c.id === req.params.id)
  if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

  const { mp3TagDefaults, sidecarDefaults, manifestDefaults, chapterPresetMap } = data
  const fromTags    = mp3TagDefaults[chapter.slug]
  if (fromTags)    return res.json({ ...fromTags, source: 'manifest' })
  const fromSidecar = sidecarDefaults[chapter.slug]
  if (fromSidecar) return res.json({ ...fromSidecar, source: 'manifest' })
  const fromManifest = manifestDefaults[chapter.slug]
  if (fromManifest) return res.json({ ...fromManifest, source: 'manifest' })

  const relPath = chapter.source_path.replace(/^chapters\//, '').replace(/\.md$/, '')
  const preset  = chapterPresetMap[chapter.slug] ?? chapterPresetMap[relPath] ?? null
  if (preset) return res.json({ engine: 'chatterbox', preset, voice: '', source: 'chapter-map' })

  res.json({ engine: 'kokoro', preset: 'male', voice: '', source: 'default' })
})

// ── Book-scoped: audio streaming ──────────────────────────────────────────────

app.get('/api/books/:bookId/audio/:volume/:filename', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const { volume, filename } = req.params
  if (filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' })
  }
  const audioPath = path.join(data.audioDir, volume, filename)
  if (!fs.existsSync(audioPath)) return res.status(404).json({ error: 'Not found' })

  const stat     = fs.statSync(audioPath)
  const fileSize = stat.size
  const range    = req.headers.range

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
    const start = parseInt(startStr, 10)
    const end   = endStr ? parseInt(endStr, 10) : fileSize - 1
    res.status(206).set({
      'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': end - start + 1,
      'Content-Type':   'audio/mpeg',
    })
    fs.createReadStream(audioPath, { start, end }).pipe(res)
  } else {
    res.set({ 'Accept-Ranges': 'bytes', 'Content-Length': fileSize, 'Content-Type': 'audio/mpeg' })
    fs.createReadStream(audioPath).pipe(res)
  }
})

// ── Book-scoped: generate ─────────────────────────────────────────────────────

app.post('/api/books/:bookId/generate', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const { chapter_id, ...options } = req.body
  if (!chapter_id) return res.status(400).json({ error: 'chapter_id required' })
  try {
    const job = startGeneration(chapter_id, options)
    res.json(job)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ── Jobs ──────────────────────────────────────────────────────────────────────

app.get('/api/jobs', (_req, res) => res.json([...jobs.values()]))

app.get('/api/jobs/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  res.json(job)
})

app.get('/api/jobs/:jobId/log', (req, res) => {
  const job = jobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  try {
    const tail = req.query.tail ? parseInt(req.query.tail) : 80
    const raw  = fs.existsSync(job.log_file) ? fs.readFileSync(job.log_file, 'utf8') : ''
    const lines = raw.split('\n')
    res.json({ log: lines.slice(-tail).join('\n'), total_lines: lines.length })
  } catch {
    res.json({ log: '', total_lines: 0 })
  }
})

// ── Book-scoped: log viewer ───────────────────────────────────────────────────

const CHUNK_RE  = /\[\s*(\d+)\/(\d+)\]\s+([\d.]+)%/
const HEADER_RE = /^(Engine|base_url|preset|voice|speed|exaggeration|cfg_weight|mode|chapter|output|Rendering)\s*[:=]/i

function parseLogMeta(filename, lines) {
  let lastChunk = null, totalChunks = null, lastProgress = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(CHUNK_RE)
    if (m) { lastChunk = parseInt(m[1]); totalChunks = parseInt(m[2]); lastProgress = parseFloat(m[3]); break }
  }
  const hasError = lines.some(l => l.includes('Traceback') || (l.includes('Error:') && !/retry \d/.test(l)))
  const hasRetry = lines.some(l => /retry \d+\/\d+/.test(l))
  const isBatch  = /^(auto-sync|full-render)/.test(filename)
  let status = 'done'
  if (hasError) status = 'error'
  else if (lastChunk !== null && lastProgress < 99.5) status = 'incomplete'
  else if (lastChunk === null && !isBatch) status = 'incomplete'
  return { filename, status, progress: lastProgress, lastChunk, totalChunks, hasRetry, hasError, isBatch }
}

function safeLogFilename(filename) {
  return filename && !filename.includes('/') && !filename.includes('..') && filename.endsWith('.log')
}

app.delete('/api/books/:bookId/logs', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  try {
    if (!fs.existsSync(data.logDir)) return res.json({ deleted: 0 })
    const files = fs.readdirSync(data.logDir).filter(f => f.endsWith('.log'))
    let deleted = 0
    for (const f of files) {
      // Skip running logs (mtime in last 2 minutes) so we don't kill an active render's log mid-write.
      try {
        const filepath = path.join(data.logDir, f)
        const stat = fs.statSync(filepath)
        if (Date.now() - stat.mtimeMs < 120_000) continue
        fs.unlinkSync(filepath)
        deleted += 1
      } catch {}
    }
    res.json({ deleted, kept_running: files.length - deleted })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/books/:bookId/logs/:filename', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const { filename } = req.params
  if (!safeLogFilename(filename)) return res.status(400).json({ error: 'Invalid filename' })
  const filepath = path.join(data.logDir, filename)
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Log not found' })
  try {
    const stat = fs.statSync(filepath)
    if (Date.now() - stat.mtimeMs < 120_000) {
      return res.status(409).json({ error: 'Log is still being written; refusing to delete' })
    }
    fs.unlinkSync(filepath)
    res.json({ deleted: 1 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/books/:bookId/logs', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  try {
    if (!fs.existsSync(data.logDir)) return res.json([])
    const files = fs.readdirSync(data.logDir)
      .filter(f => f.endsWith('.log'))
      .map(filename => {
        try {
          const filepath = path.join(data.logDir, filename)
          const stat = fs.statSync(filepath)
          const raw  = fs.readFileSync(filepath, 'utf8')
          const lines = raw.split('\n')
          const meta  = parseLogMeta(filename, lines)
          const ageMs = Date.now() - stat.mtimeMs
          const isRunning = ageMs < 120_000 && meta.status !== 'error' && meta.status !== 'done'
          return { ...meta, status: isRunning ? 'running' : meta.status, mtime: stat.mtimeMs, size: stat.size, lineCount: lines.length }
        } catch { return null }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime)
    res.json(files)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/books/:bookId/logs/:filename', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const { filename } = req.params
  if (!safeLogFilename(filename)) return res.status(400).json({ error: 'Invalid filename' })
  const filepath = path.join(data.logDir, filename)
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Log not found' })
  try {
    const raw   = fs.readFileSync(filepath, 'utf8')
    const lines = raw.split('\n')
    const stat  = fs.statSync(filepath)
    const meta  = parseLogMeta(filename, lines)
    const ageMs = Date.now() - stat.mtimeMs
    const isRunning = ageMs < 120_000 && meta.status !== 'error' && meta.status !== 'done'
    res.json({ ...meta, status: isRunning ? 'running' : meta.status, lines: lines.slice(-1000), total_lines: lines.length, mtime: stat.mtimeMs })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/books/:bookId/logs/:filename/tail', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const { filename } = req.params
  if (!safeLogFilename(filename)) return res.status(400).json({ error: 'Invalid filename' })
  const from     = Math.max(0, parseInt(req.query.from || '0', 10))
  const filepath = path.join(data.logDir, filename)
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Log not found' })
  try {
    const raw   = fs.readFileSync(filepath, 'utf8')
    const lines = raw.split('\n')
    const stat  = fs.statSync(filepath)
    const meta  = parseLogMeta(filename, lines)
    const ageMs = Date.now() - stat.mtimeMs
    const isRunning = ageMs < 120_000 && meta.status !== 'error' && meta.status !== 'done'
    res.json({ lines: lines.slice(from), from, total_lines: lines.length, status: isRunning ? 'running' : meta.status, progress: meta.progress, lastChunk: meta.lastChunk, totalChunks: meta.totalChunks })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Queue ─────────────────────────────────────────────────────────────────────

app.get('/api/queue', (_req, res) => res.json(serializeQueue()))

app.post('/api/queue', (req, res) => {
  const { items = [] } = req.body
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array required' })
  }
  const added = []
  for (const item of items) {
    const { chapter_id, options = {} } = item
    if (!chapter_id) continue
    const found = findChapterAcrossBooks(chapter_id)
    if (!found) continue
    const queueItem = {
      queue_id:      `q-${Date.now()}-${randomBytes(3).toString('hex')}`,
      chapter_id,
      chapter_title: found.chapter.title,
      book_id:       found.bookId,
      options,
      added_at:      new Date().toISOString(),
      status:        'staged',
    }
    stagedQueue.push(queueItem)
    added.push(queueItem)
  }
  broadcast('queue-updated', serializeQueue())
  res.json({ added: added.length, queue: serializeQueue() })
})

app.post('/api/queue/process', (_req, res) => {
  if (stagedQueue.length === 0) return res.json({ started: 0, queue: serializeQueue() })
  const toProcess = stagedQueue.splice(0)
  batchTotal = toProcess.length
  batchDone  = 0
  for (const item of toProcess) { item.status = 'pending'; jobQueue.push(item) }
  processNextInQueue()
  broadcast('queue-updated', serializeQueue())
  res.json({ started: toProcess.length, queue: serializeQueue() })
})

app.delete('/api/queue/staged/:qid', (req, res) => {
  const idx = stagedQueue.findIndex(item => item.queue_id === req.params.qid)
  if (idx === -1) return res.status(404).json({ error: 'Staged item not found' })
  stagedQueue.splice(idx, 1)
  broadcast('queue-updated', serializeQueue())
  res.json(serializeQueue())
})

app.delete('/api/queue/:qid', (req, res) => {
  const idx = jobQueue.findIndex(item => item.queue_id === req.params.qid)
  if (idx === -1) return res.status(404).json({ error: 'Queue item not found' })
  jobQueue.splice(idx, 1)
  broadcast('queue-updated', serializeQueue())
  res.json(serializeQueue())
})

app.delete('/api/queue', (_req, res) => {
  stagedQueue.length = 0
  jobQueue.length    = 0
  batchTotal = 0
  batchDone  = 0
  broadcast('queue-updated', serializeQueue())
  res.json(serializeQueue())
})

// Reorder helpers (for dnd-kit drag-and-drop in QueuePanel).
// Body: { order: [qid1, qid2, ...] } — must include EVERY qid in the target list.
function reorderArrayBy(arr, qidOrder) {
  if (!Array.isArray(qidOrder) || qidOrder.length !== arr.length) return null
  const lookup = new Map(arr.map(item => [item.queue_id, item]))
  if (qidOrder.some(qid => !lookup.has(qid))) return null
  arr.length = 0
  for (const qid of qidOrder) arr.push(lookup.get(qid))
  return arr
}

app.put('/api/queue/order', (req, res) => {
  const result = reorderArrayBy(jobQueue, req.body?.order)
  if (!result) return res.status(400).json({ error: 'order must include every queue_id exactly once' })
  broadcast('queue-updated', serializeQueue())
  res.json(serializeQueue())
})

app.put('/api/queue/staged/order', (req, res) => {
  const result = reorderArrayBy(stagedQueue, req.body?.order)
  if (!result) return res.status(400).json({ error: 'order must include every queue_id exactly once' })
  broadcast('queue-updated', serializeQueue())
  res.json(serializeQueue())
})

// ── Book-scoped: review session ───────────────────────────────────────────────

function newSession() {
  return { id: `review-${Date.now()}`, started: new Date().toISOString(), comments: [] }
}

function saveReviewSession(data) {
  try {
    fs.mkdirSync(path.dirname(data.reviewSessionFile), { recursive: true })
    fs.writeFileSync(data.reviewSessionFile, JSON.stringify(data.reviewSession, null, 2))
  } catch (e) {
    console.error('[review] save failed:', e.message)
  }
}

function buildReviewInboxContent(session) {
  const now = new Date().toISOString()
  const chapterIds = [...new Set(session.comments.map(c => c.chapter_id))]
  const n = session.comments.length, nc = chapterIds.length
  const frontmatter = [
    '---', `type: co-editorial-review`, `session: ${session.id}`,
    `chapters_reviewed: ${nc}`, `comment_count: ${n}`, `submitted: ${now}`,
    '---', '',
    `CO conducted a review session covering ${nc} chapter${nc !== 1 ? 's' : ''} with ${n} editorial note${n !== 1 ? 's' : ''}. Delegate each item to Yeoman using the type as the action verb: EDIT → implement the change directly; FLAG → fix the style or quality violation; NOTE → consider and optionally act; QUESTION → answer and implement if the answer is clear.`,
    '',
  ].join('\n')
  const sections = chapterIds.map(chapterId => {
    const chComments = session.comments.filter(c => c.chapter_id === chapterId)
    const { chapter_title, chapter_slug } = chComments[0]
    const header = `## ${chapter_slug} — ${chapter_title}\n`
    const items  = chComments.map(c => {
      const tag = { edit: 'EDIT', flag: 'FLAG', note: 'NOTE', question: 'QUESTION' }[c.type] || c.type.toUpperCase()
      const excerptLine = c.excerpt ? `> *"${c.excerpt.length > 140 ? c.excerpt.slice(0, 140) + '…' : c.excerpt}"*\n` : ''
      return `**[${tag}]**\n${excerptLine}${c.comment}\n`
    }).join('\n')
    return header + '\n' + items
  }).join('\n---\n\n')
  return frontmatter + sections
}

app.get('/api/books/:bookId/review/session', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  res.json({ ...data.reviewSession, comment_count: data.reviewSession.comments.length })
})

app.post('/api/books/:bookId/review/comment', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const { chapter_id, chapter_title, chapter_slug, excerpt, comment, type } = req.body
  if (!chapter_id || !comment || !type) {
    return res.status(400).json({ error: 'chapter_id, comment, and type are required' })
  }
  data.reviewSession.comments.push({
    chapter_id, chapter_title: chapter_title || chapter_id,
    chapter_slug: chapter_slug || chapter_id,
    excerpt: excerpt || '', comment, type, added_at: new Date().toISOString(),
  })
  saveReviewSession(data)
  res.json({ ...data.reviewSession, comment_count: data.reviewSession.comments.length })
})

app.patch('/api/books/:bookId/review/comment/:idx', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const idx = parseInt(req.params.idx, 10)
  if (isNaN(idx) || idx < 0 || idx >= data.reviewSession.comments.length) {
    return res.status(400).json({ error: 'Invalid comment index' })
  }
  const { comment } = req.body
  if (!comment) return res.status(400).json({ error: 'comment required' })
  data.reviewSession.comments[idx] = { ...data.reviewSession.comments[idx], comment, updated_at: new Date().toISOString() }
  saveReviewSession(data)
  res.json({ ...data.reviewSession, comment_count: data.reviewSession.comments.length })
})

app.delete('/api/books/:bookId/review/comment/:idx', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const idx = parseInt(req.params.idx, 10)
  if (isNaN(idx) || idx < 0 || idx >= data.reviewSession.comments.length) {
    return res.status(400).json({ error: 'Invalid comment index' })
  }
  data.reviewSession.comments.splice(idx, 1)
  saveReviewSession(data)
  res.json({ ...data.reviewSession, comment_count: data.reviewSession.comments.length })
})

app.delete('/api/books/:bookId/review/session', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  data.reviewSession = newSession()
  saveReviewSession(data)
  res.json({ ...data.reviewSession, comment_count: 0 })
})

app.post('/api/books/:bookId/review/submit', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const { clear_after = true } = req.body || {}
  if (data.reviewSession.comments.length === 0) {
    return res.status(400).json({ error: 'No comments to submit' })
  }
  try {
    fs.mkdirSync(data.paoInboxDir, { recursive: true })
    const ts       = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')
    const filename = `co-review-${ts}Z.md`
    const filePath = path.join(data.paoInboxDir, filename)
    fs.writeFileSync(filePath, buildReviewInboxContent(data.reviewSession))
    const comment_count = data.reviewSession.comments.length
    if (clear_after) { data.reviewSession = newSession(); saveReviewSession(data) }
    res.json({ file: path.relative(data.book.bookRoot, filePath), comment_count, cleared: clear_after })
  } catch (e) {
    console.error('[review] submit failed:', e.message)
    res.status(500).json({ error: 'Failed to write inbox file' })
  }
})

// ── Static file serving ───────────────────────────────────────────────────────

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.get('*', (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')))
} else {
  app.get('/', (_req, res) => {
    res.send('<h2>Run <code>npm run build</code> first, then restart the server.</h2>')
  })
}

app.listen(PORT, () => {
  console.log(`Galley → http://localhost:${PORT}`)
  console.log(`${library.books.length} book(s) loaded`)
  if (!fs.existsSync(DIST_DIR)) console.log('No dist/ — run: npm run build')
})
