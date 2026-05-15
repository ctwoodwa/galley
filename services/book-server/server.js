import express from 'express'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'

// Production-graph (B.1) — sidecar object model under <bookRoot>/.galley/.
// See docs/architecture/galley-production-graph.md for the data shapes
// and crash-safety contracts.
import { scaffoldProduction } from './lib/production-graph/scaffold.js'
import { readGraph } from './lib/production-graph/read.js'
import { rebuildIndex } from './lib/production-graph/index-builder.js'
import { galleyDir } from './lib/production-graph/io.js'

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

// Discover one or more roots under bookRoot to scan for chapter .md files.
// Supports several layouts (tried in order):
//   - legacy:    bookRoot/chapters/...
//   - multi-vol: bookRoot/vol-1/, bookRoot/vol-2/, ...
//   - nested-vol: bookRoot is itself named vol-N (or contains act-*/part-*/)
//   - flat:      bookRoot/*.md or bookRoot/<any-dir-with-.md-files>
// Returns [{root: absolute, prefix: <path-relative-to-bookRoot>, volId}].
// `prefix` is what gets prepended to relative paths to form source_path;
// `volId` is the volume id used for audio namespacing and chapter ids.
const SKIP_DIR_PREFIXES = ['.', '_', 'node_modules', 'build', 'dist', 'output']

function _isContentDir(name) {
  return !SKIP_DIR_PREFIXES.some(p => name === p || name.startsWith(p))
}

function _hasMarkdownDescendant(dir, depth = 0) {
  if (depth > 3) return false
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return false }
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.md')) return true
    if (e.isDirectory() && _isContentDir(e.name)) {
      if (_hasMarkdownDescendant(path.join(dir, e.name), depth + 1)) return true
    }
  }
  return false
}

function resolveChapterRoots(bookRoot) {
  if (!fs.existsSync(bookRoot)) return []
  const rootBasename = path.basename(bookRoot)

  // Each returned root carries three concepts:
  //   - root:         absolute filesystem path to scan
  //   - onDiskPrefix: relative-to-bookRoot path; used for source_path so the
  //                   file can be read at `path.join(bookRoot, source_path)`
  //   - idPrefix:     used for CHAPTER_PRESET_MAP lookups (audiobook.py keys
  //                   are like "vol-2/act-1/ch01-departure")
  //   - volId:        volume namespace for chapter id + audio dir

  // Pattern 1 — legacy: bookRoot/chapters/
  const legacy = path.join(bookRoot, 'chapters')
  if (fs.existsSync(legacy) && fs.statSync(legacy).isDirectory()) {
    return [{ root: legacy, onDiskPrefix: 'chapters', idPrefix: 'chapters', volId: 'vol-1' }]
  }

  const dirEntries = fs.readdirSync(bookRoot, { withFileTypes: true })
  const subdirs = dirEntries.filter(e => e.isDirectory() && _isContentDir(e.name))

  // Pattern 2 — multi-volume: bookRoot/vol-1, bookRoot/vol-2, ...
  const volDirs = subdirs.filter(e => /^vol-/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name))
  if (volDirs.length > 0) {
    return volDirs.map(e => ({
      root: path.join(bookRoot, e.name),
      onDiskPrefix: e.name,
      idPrefix: e.name,
      volId: e.name,
    }))
  }

  // Pattern 3 — nested-vol: bookRoot itself IS a volume (named vol-N) or
  // contains act-*/part-*/section-* subdirs. On-disk prefix is empty (the
  // act-* dirs are direct children of bookRoot); id prefix carries the
  // volume name so preset-map lookups still match audiobook.py keys.
  const isVolNamed = /^vol-/i.test(rootBasename)
  const sectionDirs = subdirs.filter(e => /^(act|part|section|chapter)-/i.test(e.name))
  if (isVolNamed || sectionDirs.length > 0) {
    return [{
      root: bookRoot,
      onDiskPrefix: '',
      idPrefix: isVolNamed ? rootBasename : '',
      volId: isVolNamed ? rootBasename : 'vol-1',
    }]
  }

  // Pattern 4 — flat: bookRoot has .md files directly, OR bookRoot has
  // arbitrary subdirs with .md descendants.
  const hasDirectMd = dirEntries.some(e => e.isFile() && e.name.endsWith('.md'))
  const hasNestedMd = subdirs.some(e => _hasMarkdownDescendant(path.join(bookRoot, e.name)))
  if (hasDirectMd || hasNestedMd) {
    return [{ root: bookRoot, onDiskPrefix: '', idPrefix: '', volId: 'vol-1' }]
  }

  return []
}

function buildCatalog(book) {
  const { id, bookRoot, volumes = [] } = book
  const audioDir    = resolveBookAudioDir(book)

  const volIds = volumes.map(v => v.id)

  // Pre-scan each volume's audio dir once. For declared volumes, scan exactly
  // those; for auto-detect mode (volumes.length === 0), scan whatever vol-*
  // dirs already exist under audioDir.
  const volFiles = {}
  const audioVolDirs = volIds.length > 0
    ? volIds
    : (fs.existsSync(audioDir)
        ? fs.readdirSync(audioDir, { withFileTypes: true })
            .filter(e => e.isDirectory() && /^vol-/i.test(e.name))
            .map(e => e.name)
        : [])
  for (const vol of audioVolDirs) {
    const dir = path.join(audioDir, vol)
    volFiles[vol] = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  }

  const chapters = []

  if (volumes.length > 0) {
    // Structured scan using declared sections. Each section.dir is
    // resolved relative to bookRoot directly (supports vol-1/act-1/...
    // style) with fallback to legacy bookRoot/chapters/<section.dir>.
    for (const vol of volumes) {
      for (const section of vol.sections || []) {
        const candidates = [
          { root: path.join(bookRoot, section.dir), prefix: section.dir },
          { root: path.join(bookRoot, 'chapters', section.dir),
            prefix: path.join('chapters', section.dir) },
        ]
        const found = candidates.find(c =>
          fs.existsSync(c.root) && fs.statSync(c.root).isDirectory())
        if (!found) continue
        for (const file of fs.readdirSync(found.root).filter(f => f.endsWith('.md')).sort()) {
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
            source_path: path.join(found.prefix, file),
            preset_key: path.join(vol.id, section.dir, file).replace(/\.md$/, ''),
            audio_path: path.join(audioDir, vol.id, `${stem}.mp3`),
            audio_files: audioFiles,
            has_audio: audioFiles.length > 0,
            title: extractTitle(stem, path.join(found.root, file)),
          })
        }
      }
    }
  } else {
    // Auto-detect: walk one or more chapter roots discovered under bookRoot.
    const roots = resolveChapterRoots(bookRoot)
    if (roots.length === 0) return chapters
    const scanDir = (dir, relDir, rootCfg) => {
      let entries
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isDirectory() && !_isContentDir(entry.name)) continue
        const full = path.join(dir, entry.name)
        const rel  = relDir ? path.join(relDir, entry.name) : entry.name
        if (entry.isDirectory()) {
          scanDir(full, rel, rootCfg)
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const stem = entry.name.replace('.md', '')
          // Volume id resolution. In legacy `chapters/vol-1/...` the actual
          // volume is encoded in the first segment of relDir; otherwise use
          // the root's declared volId.
          let volId = rootCfg.volId
          if (rootCfg.onDiskPrefix === 'chapters' && relDir) {
            const head = relDir.split(path.sep)[0]
            if (/^vol-/i.test(head)) volId = head
          }
          const audioFiles = (volFiles[volId] || []).filter(f =>
            f.endsWith('.mp3') && f.startsWith(stem) && !f.includes('__')
          )
          const section = relDir || rootCfg.onDiskPrefix || 'main'
          chapters.push({
            id: `${volId}-${stem}`,
            slug: stem,
            volume: volId,
            section,
            section_label: section,
            // source_path: ON-DISK relative to bookRoot (used by readFileSync)
            source_path: rootCfg.onDiskPrefix
              ? path.join(rootCfg.onDiskPrefix, rel)
              : rel,
            // preset_key: ID-NAMESPACE relative (used to match CHAPTER_PRESET_MAP)
            preset_key: rootCfg.idPrefix
              ? path.join(rootCfg.idPrefix, rel).replace(/\.md$/, '')
              : rel.replace(/\.md$/, ''),
            audio_path: path.join(audioDir, volId, `${stem}.mp3`),
            audio_files: audioFiles,
            has_audio: audioFiles.length > 0,
            title: extractTitle(stem, full),
          })
        }
      }
    }
    for (const r of roots) scanDir(r.root, '', r)
  }

  return chapters
}

// ── Galley build root (cache + drafts + alignments + logs live here) ──────
// Per architectural decision 2026-05-08 — drafts and intermediate artifacts
// live in galley, namespaced per bookId. Only on user-approved release does
// the book repo receive the finalized epub/m4b. Override the root via the
// GALLEY_BUILD_ROOT env var; per-book paths derive from there.
const GALLEY_BUILD_ROOT = process.env.GALLEY_BUILD_ROOT
  || path.join(__dirname, '..', '..', 'build')

function bookBuildDir(bookId)    { return path.join(GALLEY_BUILD_ROOT, bookId) }
function bookOutputDir(bookId)   { return path.join(bookBuildDir(bookId), 'output') }
function defaultBookAudioDir(bookId) { return path.join(bookOutputDir(bookId), 'audiobook') }
function bookAlignmentDir(bookId){ return path.join(bookBuildDir(bookId), 'alignments') }

// Galley sidecar path inside a book repo. Holds files that galley
// generates/edits on the book's behalf — distinct from
// `<bookRoot>/book.editorial.yaml`, which is the author-owned prose-
// pipeline config and must not be clobbered by the UI.
function bookGalleyDir(bookRoot) { return path.join(bookRoot, '.galley') }
function editorialProfilePath(bookRoot) {
  return path.join(bookGalleyDir(bookRoot), 'editorial.json')
}

// Path to the author-owned editorial yaml at the book repo root.
function editorialYamlPath(bookRoot) {
  return path.join(bookRoot, 'book.editorial.yaml')
}

// Scaffold `<bookRoot>/book.editorial.yaml` with sensible defaults
// when a new book is added. Mirrors the template in galley/prose's
// `prose_telemetry.init.build_default_yaml` (Python is canonical;
// this JS copy avoids a Python subprocess on book-add). Refuses to
// overwrite existing files. Returns {wrote, path} so the caller can
// surface the result to the UI.
function scaffoldEditorialYaml(bookRoot, { bookId, voice, genre } = {}) {
  const target = editorialYamlPath(bookRoot)
  if (fs.existsSync(target)) {
    return { wrote: false, path: target, reason: 'file exists' }
  }
  const resolvedId = bookId || path.basename(bookRoot)
  const resolvedVoice = voice ? String(voice) : 'null'
  const resolvedGenre = genre || 'literary-fiction'
  const timestamp = new Date().toISOString().slice(0, 10)
  const content = `# Editorial profile for ${resolvedId}.
#
# Author-owned configuration consumed by the galley/prose pipeline. The
# galley settings UI lays an overlay on top of this file at
# \`.galley/editorial.json\` (preset scaling + narrator voice); the
# pipeline reads both via \`BookProfile.from_book_root\`.
#
# Generated by book-server's Add-Book flow on ${timestamp}.
# Edit freely. Re-scaffold with \`prose init <bookRoot> --force\` if
# you ever want a fresh template. Detectors not listed below fall back
# to galley/prose built-in defaults.

book_id: ${resolvedId}
voice: ${resolvedVoice}
genre: ${resolvedGenre}

detectors:

  # ─── Voice detectors ──────────────────────────────────────────────────
  filter_words:
    filter_words: []
    # warning_raw_count: 8
    # blocker_raw_count: 20

  motif_overuse:
    retired_motifs: []
    motifs: {}
    # warning_raw_count: 1
    # blocker_raw_count: 3

  self_referential_frame:
    self_referential_frames: []
    # warning_raw_count: 2
    # blocker_raw_count: 4

  # ─── Chain detectors ──────────────────────────────────────────────────
  # Generic English stopwords ship as detector defaults. Add book-
  # specific high-frequency register words here.
  lexical_chain_loop:
    stopwords: []

  bigram_chain_loop:
    extra:
      stopword_bigrams: []     # e.g. [[staff, history]]

  trigram_chain_loop:
    extra:
      stopword_trigrams: []    # e.g. [[the, staff, history]]

compute:
  cpu_workers: 4
  gpu_mode: auto
`
  fs.writeFileSync(target, content, 'utf8')
  return { wrote: true, path: target }
}

// Whitelisted shape — must match `EditorialPrefs` in
// apps/web/src/api/editorialPrefs.ts. Keeps malformed PUTs from
// landing on disk.
const PROSE_PRESETS = new Set(['gentle', 'standard', 'strict'])
const VOICE_PASS_MODES = new Set(['off', 'read-only', 'auto-apply'])

function validateEditorialPrefs(input) {
  if (!input || typeof input !== 'object') return { error: 'Body must be an object.' }
  const { activeVoice, prosePreset, voicePassMode } = input
  if (typeof activeVoice !== 'string') return { error: 'activeVoice must be a string.' }
  if (!PROSE_PRESETS.has(prosePreset))
    return { error: `prosePreset must be one of ${[...PROSE_PRESETS].join(', ')}.` }
  if (!VOICE_PASS_MODES.has(voicePassMode))
    return { error: `voicePassMode must be one of ${[...VOICE_PASS_MODES].join(', ')}.` }
  return { value: { activeVoice, prosePreset, voicePassMode } }
}

// Resolve the audiobook directory for a book. Three-tier:
//   1. Explicit `book.audioRoot` if set and existing on disk
//   2. Auto-discovered sibling under GALLEY_BUILD_ROOT (see discoverAudioRoot)
//   3. Default per-book location at galley/build/<id>/output/audiobook/
// The default is also returned for fresh books so audio rendered for them
// lands in the canonical place.
function resolveBookAudioDir(book) {
  if (book.audioRoot) {
    return book.audioRoot
  }
  return defaultBookAudioDir(book.id)
}

// Scan sibling book build dirs for audio matching this book's volumes and
// chapter slugs. Returns the first candidate audioRoot with ≥1 matching mp3,
// or null if none. Used during add-book to migrate existing audio without
// requiring the user to know where it lives.
function discoverAudioRoot(volIds, slugs) {
  if (!fs.existsSync(GALLEY_BUILD_ROOT)) return null
  const slugSet = new Set(slugs)
  let candidates
  try {
    candidates = fs.readdirSync(GALLEY_BUILD_ROOT, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => path.join(GALLEY_BUILD_ROOT, e.name, 'output', 'audiobook'))
      .filter(p => fs.existsSync(p) && fs.statSync(p).isDirectory())
  } catch { return null }
  for (const candidate of candidates) {
    let matched = 0
    for (const vol of volIds) {
      const volPath = path.join(candidate, vol)
      if (!fs.existsSync(volPath)) continue
      try {
        const mp3s = fs.readdirSync(volPath).filter(f => f.endsWith('.mp3'))
        for (const mp3 of mp3s) {
          const stem = mp3.replace(/\.mp3$/, '').split('--')[0]
          if (slugSet.has(stem)) matched++
        }
      } catch { /* ignore */ }
    }
    if (matched > 0) {
      return { audioRoot: candidate, matched }
    }
  }
  return null
}

// ── Per-book runtime state ────────────────────────────────────────────────────

const bookData = new Map()

function initBook(book) {
  const { id, bookRoot, volumes = [] } = book
  const volIds     = volumes.map(v => v.id)
  const chapterRoots = resolveChapterRoots(bookRoot)
  const alignmentDir = bookAlignmentDir(id)

  // Resolve audio root: explicit > auto-discovered > default. If
  // auto-discovered, persist it on the book record so the choice is sticky.
  if (!book.audioRoot) {
    const probe = buildCatalog(book)
    const probeVols = [...new Set(probe.map(c => c.volume))]
    const probeSlugs = probe.map(c => c.slug)
    const found = discoverAudioRoot(probeVols, probeSlugs)
    if (found) {
      book.audioRoot = found.audioRoot
      console.log(`[book] ${id}: auto-discovered audioRoot ${found.audioRoot} (${found.matched} matching mp3s)`)
      // Persist so future loads skip the probe.
      const libBook = library.books.find(b => b.id === id)
      if (libBook) { libBook.audioRoot = found.audioRoot; saveLibrary(library) }
    }
  }
  const audioDir   = resolveBookAudioDir(book)
  const logDir     = path.join(audioDir, '_logs')

  const chapters       = buildCatalog(book)
  const chapterPresetMap = loadChapterPresetMap(bookRoot)
  const manifestDefaults = loadManifest(audioDir)
  const sidecarDefaults  = loadSidecars(audioDir, volIds.length ? volIds : ['vol-1', 'vol-2'])
  const mp3TagDefaults   = loadMp3Tags(audioDir, volIds.length ? volIds : ['vol-1', 'vol-2'])

  const reviewSessionFile = path.join(bookOutputDir(id), 'review-session.json')
  let reviewSession
  try {
    reviewSession = fs.existsSync(reviewSessionFile)
      ? JSON.parse(fs.readFileSync(reviewSessionFile, 'utf8'))
      : newSession()
  } catch { reviewSession = newSession() }

  bookData.set(id, {
    book, chapterRoots, audioDir, alignmentDir, logDir, volIds,
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
  const { chapterRoots = [], audioDir, book, volIds } = data

  for (const r of chapterRoots) {
    if (!fs.existsSync(r.root)) continue
    fs.watch(r.root, { recursive: true }, (event, filename) => {
      if (filename && filename.endsWith('.md')) {
        scheduleRebuild(bookId, `${r.prefix}/${filename} ${event}`)
      }
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
  // `=` syntax avoids the argparse "expected one argument" error when the
  // suffix starts with `-` (the QueuePanel emits e.g. `--af_bella` so that
  // chapter files land as `chapter-N--af_bella.mp3`; argparse otherwise
  // sees `--af_bella` as a separate flag).
  if (options.output_suffix)        args.push(`--output-suffix=${options.output_suffix}`)

  const env = { ...process.env }
  if (options.api_key) env.TTS_API_KEY = options.api_key

  // Node 24+ requires an already-opened file descriptor for stdio when the
  // child process is spawned. fs.createWriteStream opens async, so its
  // .fd is still null when spawn() runs — that throws "argument 'stdio'
  // is invalid. Received WriteStream{ fd: null }". Use openSync to get
  // a real fd up-front; close it after spawn detaches.
  const logFd = fs.openSync(logFile, 'a')
  const proc = spawn('python3', args, {
    cwd: data.book.bookRoot,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env,
  })
  proc.unref()
  // Parent process can close its handle now — the child has its own
  // duplicates of the fd via stdio.
  try { fs.closeSync(logFd) } catch {}

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
  // Don't broadcast yet — wait until job_id is attached so the frontend's
  // log poll has something to subscribe to. Without this, the active item
  // gets broadcast with job_id=undefined and the live log never appears.
  try {
    const job = startGeneration(item.chapter_id, item.options, (finishedJob) => {
      item.status = finishedJob.status
      item.job_id = finishedJob.id
      item.finished_at = finishedJob.finished
      queueHistory.unshift({ ...item })
      if (queueHistory.length > QUEUE_HISTORY_MAX) queueHistory.pop()
      batchDone++
      activeQueueItem = null
      // Last item just landed — clear the batch so the progress footer
      // hides. (`batch:` in serializeQueue is gated on batchTotal > 0.)
      // Without this the footer shows "Rendering N/N" forever.
      if (jobQueue.length === 0) { batchTotal = 0; batchDone = 0 }
      broadcast('queue-updated', serializeQueue())
      processNextInQueue()
    })
    item.job_id = job.id
    // NOW broadcast — active item carries job_id so the frontend can poll
    // /api/jobs/<job_id>/log every 2s and surface the live render output.
    broadcast('queue-updated', serializeQueue())
  } catch (e) {
    item.status = 'failed'
    item.error = e.message
    item.finished_at = new Date().toISOString()
    queueHistory.unshift({ ...item })
    batchDone++
    activeQueueItem = null
    if (jobQueue.length === 0) { batchTotal = 0; batchDone = 0 }
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
  const { id, title, bookRoot, audioRoot } = req.body
  if (!id || !title || !bookRoot) {
    return res.status(400).json({ error: 'id, title, and bookRoot are required' })
  }
  if (library.books.find(b => b.id === id)) {
    return res.status(409).json({ error: `Book "${id}" already exists` })
  }
  if (!fs.existsSync(bookRoot)) {
    return res.status(400).json({ error: `bookRoot does not exist: ${bookRoot}` })
  }
  if (audioRoot && !fs.existsSync(audioRoot)) {
    return res.status(400).json({ error: `audioRoot does not exist: ${audioRoot}` })
  }
  const book = { id, title, bookRoot, volumes: [] }
  if (audioRoot) book.audioRoot = audioRoot
  library.books.push(book)
  saveLibrary(library)
  // Auto-scaffold book.editorial.yaml so the prose pipeline has an
  // author-owned config to read on first measurement. No-op if the
  // file already exists — refuses to clobber hand-tuned values.
  let scaffold
  try {
    scaffold = scaffoldEditorialYaml(bookRoot, { bookId: id })
    if (scaffold.wrote) {
      console.log(`[book] ${id}: scaffolded ${scaffold.path}`)
    }
  } catch (e) {
    console.error(`[book] scaffold failed for "${id}":`, e.message)
    scaffold = { wrote: false, error: e.message }
  }
  try {
    const data = initBook(book)  // may mutate book.audioRoot if auto-discovered
    watchBook(id, data)
  } catch (e) {
    console.error(`[book] init failed for "${id}":`, e.message)
  }
  const stored = library.books.find(b => b.id === id) || book
  res.json({
    id, title, bookRoot,
    audioRoot: stored.audioRoot || null,
    chapter_count: bookData.get(id)?.chapters.length ?? 0,
    editorial_yaml: scaffold,
  })
})

// Suggest an audioRoot for a candidate bookRoot before the user commits to
// adding the book. The UI calls this after the user picks bookRoot, so the
// "Audio root" field can be pre-filled with the discovered path.
app.post('/api/books/discover-audio-root', (req, res) => {
  const { bookRoot } = req.body
  if (!bookRoot || !fs.existsSync(bookRoot)) {
    return res.status(400).json({ error: 'bookRoot is required and must exist' })
  }
  // Pre-flight a catalog scan to learn vols + slugs.
  const fakeBook = { id: '__discovery__', bookRoot, volumes: [] }
  const probe = buildCatalog(fakeBook)
  if (probe.length === 0) {
    return res.json({ audioRoot: null, matched: 0, chapter_count: 0 })
  }
  const probeVols = [...new Set(probe.map(c => c.volume))]
  const probeSlugs = probe.map(c => c.slug)
  const found = discoverAudioRoot(probeVols, probeSlugs)
  res.json({
    audioRoot: found?.audioRoot || null,
    matched: found?.matched || 0,
    chapter_count: probe.length,
    volumes: probeVols,
    default: defaultBookAudioDir('<book-id>'),  // for UI helper text
  })
})

// ── Filesystem browser (used by the directory-picker in the library UI) ──────
// Returns directory entries under a path. Restricted to under $HOME to avoid
// exposing arbitrary filesystem paths to the page. Symlinks pointing outside
// the home root are not followed; their target is reported as-is but not
// recursable.

const FS_BROWSE_ROOT = os.homedir()

function _isUnderHome(absPath) {
  const resolved = path.resolve(absPath)
  const home = path.resolve(FS_BROWSE_ROOT)
  return resolved === home || resolved.startsWith(home + path.sep)
}

app.get('/api/fs/browse', (req, res) => {
  let target = req.query.path ? String(req.query.path) : FS_BROWSE_ROOT
  target = path.resolve(target)
  if (!_isUnderHome(target)) {
    return res.status(403).json({ error: 'Access restricted to home directory and subfolders' })
  }
  if (!fs.existsSync(target)) {
    return res.status(404).json({ error: `Path does not exist: ${target}` })
  }
  const stat = fs.statSync(target)
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: 'Path is not a directory' })
  }
  let entries
  try {
    entries = fs.readdirSync(target, { withFileTypes: true })
  } catch (e) {
    return res.status(403).json({ error: `Cannot read directory: ${e.message}` })
  }
  const dirs = entries
    .filter(e => !e.name.startsWith('.'))  // skip hidden files
    .map(e => {
      const full = path.join(target, e.name)
      let isDirectory = e.isDirectory()
      // Resolve symlinks for the isDirectory hint only.
      if (e.isSymbolicLink()) {
        try { isDirectory = fs.statSync(full).isDirectory() } catch { isDirectory = false }
      }
      return { name: e.name, isDirectory }
    })
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  const parent = target === FS_BROWSE_ROOT ? null : path.dirname(target)
  res.json({
    path: target,
    parent,
    home: FS_BROWSE_ROOT,
    entries: dirs,
  })
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
    const relPath = ch.preset_key
      || ch.source_path.replace(/^chapters\//, '').replace(/\.md$/, '')
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

// ── Book-scoped: production graph (B.1 — scaffold + read-only) ───────────────
// The production graph is the asset/task/approval/review/job object model
// landed under <bookRoot>/.galley/. See docs/architecture/galley-production-
// graph.md for the data shapes, ID scheme, crash-safety markers, and the
// index lifecycle. B.1 scope is auto-scaffold on first open + read-only API
// over the assembled graph.

/**
 * POST /api/books/:bookId/graph/scaffold
 *
 * Idempotent. Re-entrant: a scaffold interrupted by crash leaves the
 * `_scaffold.lock` marker; the next call recovers via the marker pair
 * protocol described in the spec.
 */
app.post('/api/books/:bookId/graph/scaffold', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  try {
    const result = scaffoldProduction({
      bookRoot:  data.book.bookRoot,
      bookId:    data.book.id,
      bookTitle: data.book.title,
      chapters:  data.chapters,
    })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: `Scaffold failed: ${e.message}` })
  }
})

/**
 * GET /api/books/:bookId/graph
 *
 * Returns the production graph for this book. If the graph has not
 * yet been scaffolded, scaffolds it first (lazy on read). The
 * response shape stays stable across phases — B.2+ kinds appear as
 * empty arrays until they're populated.
 */
app.get('/api/books/:bookId/graph', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  try {
    // Idempotent scaffold — no-op once `_scaffold.complete` is present.
    scaffoldProduction({
      bookRoot:  data.book.bookRoot,
      bookId:    data.book.id,
      bookTitle: data.book.title,
      chapters:  data.chapters,
    })
    const graph = readGraph(data.book.bookRoot)
    res.json(graph)
  } catch (e) {
    res.status(500).json({ error: `Graph read failed: ${e.message}` })
  }
})

/**
 * DELETE /api/books/:bookId/graph/index
 *
 * Explicit index flush. Drops `_index/` and forces a full rebuild on
 * the next read. Useful for the test harness and for debugging an
 * apparently-stale index.
 */
app.delete('/api/books/:bookId/graph/index', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  try {
    const indexDir = path.join(galleyDir(data.book.bookRoot), '_index')
    if (fs.existsSync(indexDir)) {
      fs.rmSync(indexDir, { recursive: true, force: true })
    }
    rebuildIndex(data.book.bookRoot)
    res.status(204).end()
  } catch (e) {
    res.status(500).json({ error: `Index flush failed: ${e.message}` })
  }
})

// ── Book-scoped: editorial profile sidecar ────────────────────────────────────
// Read/write the galley UI editorial overlay at <bookRoot>/.galley/editorial.json.
// This is an overlay that the prose pipeline can later choose to merge on top
// of the author-owned `book.editorial.yaml` — galley never edits the yaml
// directly. Missing file returns `{ prefs: null }` rather than 404 so clients
// can distinguish "book exists, no overlay yet" from "no such book".

app.get('/api/books/:bookId/profile/editorial', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const filePath = editorialProfilePath(data.book.bookRoot)
  if (!fs.existsSync(filePath)) return res.json({ prefs: null, updated_at: null })
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    // Server-stamped updated_at is the LWW basis for the client. Fall back
    // to the file's mtime if a hand-edited sidecar lacks the field.
    let updatedAt = parsed.updated_at ?? null
    if (!updatedAt) {
      try { updatedAt = fs.statSync(filePath).mtime.toISOString() } catch { updatedAt = null }
    }
    res.json({ prefs: parsed.prefs ?? null, updated_at: updatedAt })
  } catch (e) {
    res.status(500).json({ error: `Failed to read editorial profile: ${e.message}` })
  }
})

app.put('/api/books/:bookId/profile/editorial', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const incoming = req.body?.prefs
  const check = validateEditorialPrefs(incoming)
  if (check.error) return res.status(400).json({ error: check.error })

  const dir = bookGalleyDir(data.book.bookRoot)
  const filePath = editorialProfilePath(data.book.bookRoot)
  try {
    fs.mkdirSync(dir, { recursive: true })
    const payload = {
      schema_version: 1,
      updated_at: new Date().toISOString(),
      prefs: check.value,
    }
    // Atomic write — write to a temp sibling and rename, so a crash mid-
    // write can't leave a half-written editorial.json.
    const tmp = filePath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8')
    fs.renameSync(tmp, filePath)
    res.json(payload)
  } catch (e) {
    res.status(500).json({ error: `Failed to write editorial profile: ${e.message}` })
  }
})

// ── Editorial chat sidecar (per-chapter conversation history) ─────────
// Persists the chat turns the user has with the editorial agent for a
// given chapter as JSON at `<bookRoot>/.galley/chats/<chapterId>.json`.
// The web app debounces writes the same way useEditorialPrefs does for
// the editorial overlay (see apps/web/src/api/editorialChat.ts).

function chapterChatPath(bookRoot, chapterId) {
  // Chapter IDs are slugs (ASCII / dashes / colons). Sanitize defensively
  // to keep the write confined to the chats dir.
  const safe = String(chapterId).replace(/[^A-Za-z0-9._:-]/g, '_')
  return path.join(bookRoot, '.galley', 'chats', `${safe}.json`)
}

app.get('/api/books/:bookId/chats/:chapterId', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const target = chapterChatPath(data.book.bookRoot, req.params.chapterId)
  if (!fs.existsSync(target)) {
    return res.json({ chat: null, updated_at: null })
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'))
    let updatedAt = parsed.updated_at ?? null
    if (!updatedAt) {
      try { updatedAt = fs.statSync(target).mtime.toISOString() } catch { updatedAt = null }
    }
    res.json({ chat: parsed.chat ?? null, updated_at: updatedAt })
  } catch (e) {
    res.status(500).json({ error: `Failed to read chat sidecar: ${e.message}` })
  }
})

app.put('/api/books/:bookId/chats/:chapterId', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const chat = req.body?.chat
  if (!chat || typeof chat !== 'object' || !Array.isArray(chat.turns)) {
    return res.status(400).json({ error: 'Body must be { chat: { turns: [...] } }' })
  }
  // Per-turn shape check — keep malformed turns out of disk state.
  for (const t of chat.turns) {
    if (typeof t !== 'object' || !t || !t.id || !t.role || typeof t.content !== 'string') {
      return res.status(400).json({ error: 'Each turn must have {id, role, content}' })
    }
    if (!['user', 'assistant', 'system'].includes(t.role)) {
      return res.status(400).json({ error: `Turn role must be user|assistant|system (got ${t.role})` })
    }
  }
  const dir = path.join(data.book.bookRoot, '.galley', 'chats')
  const target = chapterChatPath(data.book.bookRoot, req.params.chapterId)
  try {
    fs.mkdirSync(dir, { recursive: true })
    const payload = {
      schema_version: 1,
      updated_at: new Date().toISOString(),
      chat,
    }
    const tmp = target + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8')
    fs.renameSync(tmp, target)
    res.json(payload)
  } catch (e) {
    res.status(500).json({ error: `Failed to write chat sidecar: ${e.message}` })
  }
})

app.delete('/api/books/:bookId/chats/:chapterId', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const target = chapterChatPath(data.book.bookRoot, req.params.chapterId)
  if (fs.existsSync(target)) fs.unlinkSync(target)
  res.json({ deleted: true })
})

// Run the prose-telemetry pipeline on a chapter and return the JSON
// metrics. Two ways to identify the chapter:
//   - `?chapter=<absolute_path>` — explicit file path on disk.
//   - `?chapterId=<id>` — resolved via the book's chapter catalog.
// AI agents prefer this endpoint over shelling out to the CLI.
app.post('/api/books/:bookId/measure', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })

  let chapterPath = req.query.chapter || req.body?.chapter
  const chapterId = req.query.chapterId || req.body?.chapterId
  if (!chapterPath && chapterId) {
    const ch = data.chapters.find(c => c.id === chapterId)
    if (!ch) return res.status(404).json({ error: `Chapter "${chapterId}" not found in book` })
    chapterPath = path.join(data.book.bookRoot, ch.source_path)
  }
  if (!chapterPath) {
    return res.status(400).json({ error: 'Pass ?chapter=<path> or ?chapterId=<id>' })
  }
  if (!fs.existsSync(chapterPath)) {
    return res.status(404).json({ error: `Chapter file not found: ${chapterPath}` })
  }

  // Skip flags map to CLI flags one-for-one.
  const flags = []
  if (req.query.no_stdlib === '1' || req.body?.no_stdlib) flags.push('--no-stdlib')
  if (req.query.no_spacy === '1'  || req.body?.no_spacy)  flags.push('--no-spacy')
  if (req.query.no_registry === '1' || req.body?.no_registry) flags.push('--no-registry')

  // Optional preset override — telemetry panel passes one of
  // 'gentle' | 'standard' | 'strict' when the user clicks the
  // header preset switcher. Validated here so a malformed query
  // can't reach the spawn call.
  const presetRaw = req.query.preset || req.body?.preset
  if (presetRaw) {
    const allowed = new Set(['gentle', 'standard', 'strict'])
    if (!allowed.has(String(presetRaw))) {
      return res.status(400).json({
        error: `Invalid preset "${presetRaw}". Expected one of: gentle, standard, strict.`,
      })
    }
    flags.push('--preset-override', String(presetRaw))
  }

  const pythonBin = process.env.GALLEY_PROSE_PYTHON ||
    path.join(__dirname, '..', '..', 'prose', 'lib', 'prose_telemetry', '.venv', 'bin', 'python')

  const args = ['-m', 'prose_telemetry.cli', 'measure', chapterPath, '--stdout',
                '--book-repo', data.book.bookRoot, ...flags]

  const child = spawn(pythonBin, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', d => { stdout += d.toString('utf8') })
  child.stderr.on('data', d => { stderr += d.toString('utf8') })
  child.on('error', (err) => {
    res.status(500).json({ error: `Failed to spawn prose-telemetry: ${err.message}` })
  })
  child.on('close', (code) => {
    if (code !== 0) {
      return res.status(500).json({
        error: `prose-telemetry exited ${code}`,
        stderr: stderr.slice(-2000),
      })
    }
    try {
      res.json(JSON.parse(stdout))
    } catch (e) {
      res.status(500).json({
        error: `Failed to parse CLI output as JSON: ${e.message}`,
        stdout_head: stdout.slice(0, 200),
      })
    }
  })
})

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
  const alignPath = path.join(data.alignmentDir, `${chapter.slug}.json`)
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

// ── Phase E: sentence-level edits ─────────────────────────────────────────
// Append-only JSONL log of pending sentence edits per chapter. The actual
// re-render orchestration happens in Phase F (stale audio playback) +
// Phase H (render-now vs queued). For now the edit gets persisted and the
// chunk is marked stale; the frontend's amber margin dot reflects that.
app.post('/api/books/:bookId/chapters/:id/sentence-edit', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const chapter = data.chapters.find(c => c.id === req.params.id)
  if (!chapter) return res.status(404).json({ error: 'Chapter not found' })
  const { chunk_id, new_text, tier, prev_text } = req.body || {}
  if (!chunk_id || typeof new_text !== 'string') {
    return res.status(400).json({ error: 'chunk_id and new_text required' })
  }
  const editsDir = path.join(bookBuildDir(req.params.bookId), 'pending-edits')
  fs.mkdirSync(editsDir, { recursive: true })
  const editLog = path.join(editsDir, `${chapter.slug}.jsonl`)
  const event = {
    ts: new Date().toISOString(),
    chapter_slug: chapter.slug,
    chunk_id,
    new_text,
    prev_text: prev_text ?? null,
    tier: tier === 'fast' ? 'fast' : 'quality',
  }
  try {
    fs.appendFileSync(editLog, JSON.stringify(event) + '\n')
    res.json({ ok: true, event })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Phase E commit step (Option A): apply pending edits to source.md and
// optionally trigger regen. Idempotent on the journal — once applied,
// the journal is rotated to applied-edits/<slug>-<ts>.jsonl as an audit
// trail. Source.md is mutated atomically (tmp + rename); on parse-style
// failure mid-batch we abort before any disk write so the file never
// lands half-applied.
app.post('/api/books/:bookId/chapters/:id/commit-edits', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const chapter = data.chapters.find(c => c.id === req.params.id)
  if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

  const { regen = false, options = {} } = req.body || {}

  const editsDir = path.join(bookBuildDir(req.params.bookId), 'pending-edits')
  const editLog  = path.join(editsDir, `${chapter.slug}.jsonl`)
  if (!fs.existsSync(editLog)) {
    return res.status(400).json({ error: 'No pending edits' })
  }

  let edits
  try {
    edits = fs.readFileSync(editLog, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
  } catch (err) {
    return res.status(500).json({ error: `Journal parse failed: ${err.message}` })
  }
  if (edits.length === 0) {
    return res.status(400).json({ error: 'Journal is empty' })
  }

  const sourcePath = path.join(data.book.bookRoot, chapter.source_path)
  let content
  try { content = fs.readFileSync(sourcePath, 'utf8') }
  catch (err) { return res.status(500).json({ error: `Read source.md: ${err.message}` }) }

  // Apply edits in journal order. For each: locate prev_text (first
  // occurrence) and replace with new_text. Skip-with-reason if prev_text
  // is missing (already-applied / external edit) or empty (legacy entry).
  const applied = [], skipped = []
  let working = content
  for (const e of edits) {
    if (!e.prev_text) {
      skipped.push({ chunk_id: e.chunk_id, reason: 'no prev_text in journal entry' })
      continue
    }
    const idx = working.indexOf(e.prev_text)
    if (idx < 0) {
      skipped.push({ chunk_id: e.chunk_id, reason: 'prev_text not found (already applied or externally edited)' })
      continue
    }
    working = working.slice(0, idx) + e.new_text + working.slice(idx + e.prev_text.length)
    applied.push({ chunk_id: e.chunk_id, prev_chars: e.prev_text.length, new_chars: e.new_text.length })
  }

  if (applied.length === 0) {
    return res.status(409).json({ error: 'No edits could be applied', skipped })
  }

  // Atomic write: tmp + rename. Same volume, so rename is atomic.
  const tmp = sourcePath + '.commit-edits.tmp'
  try {
    fs.writeFileSync(tmp, working, 'utf8')
    fs.renameSync(tmp, sourcePath)
  } catch (err) {
    try { fs.unlinkSync(tmp) } catch {}
    return res.status(500).json({ error: `Write source.md: ${err.message}` })
  }

  // Rotate the journal: move the applied entries out of pending-edits/
  // and into applied-edits/ for audit. If only some edits applied, only
  // rotate those (we keep skipped entries in the live journal so the
  // user sees them in the UI as "needs attention").
  const appliedDir = path.join(bookBuildDir(req.params.bookId), 'applied-edits')
  fs.mkdirSync(appliedDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const archive = path.join(appliedDir, `${chapter.slug}-${ts}.jsonl`)
  const appliedSet = new Set(applied.map(a => a.chunk_id))
  const appliedLines = edits.filter(e => appliedSet.has(e.chunk_id)).map(JSON.stringify).join('\n')
  fs.writeFileSync(archive, appliedLines + '\n', 'utf8')
  const remainingLines = edits.filter(e => !appliedSet.has(e.chunk_id)).map(JSON.stringify).join('\n')
  if (remainingLines) {
    fs.writeFileSync(editLog, remainingLines + '\n', 'utf8')
  } else {
    fs.unlinkSync(editLog)
  }

  let job = null
  if (regen) {
    try {
      job = startGeneration(chapter.id, { ...options, force: true })
    } catch (err) {
      return res.json({ applied, skipped, regen_error: err.message })
    }
  }

  res.json({
    applied,
    skipped,
    archive: path.relative(data.book.bookRoot, archive),
    job_id: job?.id ?? null,
  })
})

// Phase I: book-wide summary of which chapters have pending sentence edits.
// Drives the "Stage all with edits" gesture in the queue panel — one click
// to apply + stage everything across the book.
app.get('/api/books/:bookId/pending-edits-summary', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const editsDir = path.join(bookBuildDir(req.params.bookId), 'pending-edits')
  if (!fs.existsSync(editsDir)) return res.json([])
  const result = []
  for (const file of fs.readdirSync(editsDir)) {
    if (!file.endsWith('.jsonl')) continue
    const slug = file.replace(/\.jsonl$/, '')
    const chapter = data.chapters.find(c => c.slug === slug)
    if (!chapter) continue
    let count = 0
    try {
      count = fs.readFileSync(path.join(editsDir, file), 'utf8').trim().split('\n').filter(Boolean).length
    } catch {}
    if (count === 0) continue
    result.push({
      chapter_id: chapter.id,
      chapter_slug: chapter.slug,
      chapter_title: chapter.title,
      volume: chapter.volume,
      count,
    })
  }
  res.json(result)
})

app.get('/api/books/:bookId/chapters/:id/sentence-edits', (req, res) => {
  const data = getBook(req.params.bookId)
  if (!data) return res.status(404).json({ error: 'Book not found' })
  const chapter = data.chapters.find(c => c.id === req.params.id)
  if (!chapter) return res.status(404).json({ error: 'Chapter not found' })
  const editLog = path.join(bookBuildDir(req.params.bookId), 'pending-edits', `${chapter.slug}.jsonl`)
  if (!fs.existsSync(editLog)) return res.json([])
  try {
    const lines = fs.readFileSync(editLog, 'utf8').trim().split('\n').filter(Boolean)
    const events = lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    // Latest edit per chunk_id wins.
    const latest = new Map()
    for (const e of events) latest.set(e.chunk_id, e)
    res.json([...latest.values()])
  } catch (err) {
    res.status(500).json({ error: err.message })
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

  const relPath = chapter.preset_key
    || chapter.source_path.replace(/^chapters\//, '').replace(/\.md$/, '')
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
