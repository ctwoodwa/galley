/**
 * Production-graph B.1 scaffold.
 *
 * On first book-open (or any open where production.json is
 * absent), scaffold the production-graph layout under
 * <bookRoot>/.galley/ with sensible defaults derived from the
 * existing book metadata.
 *
 * Hardened per spec sections:
 *   - line 574 — _scaffold.lock / _scaffold.complete marker pair
 *   - line 576 — creating an existing sidecar is a no-op merge
 *   - line 106 — versioningBackend detection
 *   - line 141 — book-root narrative-unit anchors to production:root
 *   - line 179 — visibility "production" + accessControl.allow []
 *   - line 234 — participants/<id>.json per-file layout
 *   - line 404 — emit one `scaffold` event after bulk-create
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

import { slugify, urn } from './ids.js'
import {
  galleyDir,
  ensureDir,
  readJson,
  writeJsonAtomic,
  tryCreateLock,
  appendEvent,
  buildSystemEvent,
} from './io.js'

export const SCHEMA_VERSION = 1
const LOCK_NAME = '_scaffold.lock'
const COMPLETE_NAME = '_scaffold.complete'

/**
 * Idempotent. Safe to call on every book-open.
 */
export function scaffoldProduction({ bookRoot, bookId, bookTitle, chapters }) {
  if (!bookRoot || !fs.existsSync(bookRoot)) {
    return { scaffolded: false, reason: 'bookRoot missing' }
  }

  const dir = galleyDir(bookRoot)
  ensureDir(dir)

  const completePath = path.join(dir, COMPLETE_NAME)
  const lockPath = path.join(dir, LOCK_NAME)

  // Marker check (spec line 574, fourth bullet):
  // _scaffold.complete with schemaVersion >= current → clean; return.
  const completeRecord = readJson(completePath)
  if (completeRecord && completeRecord.schemaVersion >= SCHEMA_VERSION) {
    return { scaffolded: false, reason: 'already-complete' }
  }

  // Acquire the lock. If another writer holds it, back off.
  // A lock older than 60s is treated as stale (orphaned from a
  // crashed process); we steal it and retry.
  let gotLock = tryCreateLock(lockPath, {
    startedAt: new Date().toISOString(),
    pid: process.pid,
    schemaVersion: SCHEMA_VERSION,
  })
  if (!gotLock) {
    const existing = readJson(lockPath)
    const ageMs = existing?.startedAt
      ? Date.now() - new Date(existing.startedAt).getTime()
      : Infinity
    if (ageMs > 60_000) {
      try { fs.unlinkSync(lockPath) } catch (_) { /* ignore */ }
      gotLock = tryCreateLock(lockPath, {
        startedAt: new Date().toISOString(),
        pid: process.pid,
        schemaVersion: SCHEMA_VERSION,
        recoveredFromStaleLock: true,
      })
    }
  }
  if (!gotLock) {
    return { scaffolded: false, reason: 'another-writer' }
  }

  try {
    const result = doScaffold({ bookRoot, bookId, bookTitle, chapters, dir })

    writeJsonAtomic(completePath, {
      completedAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      productionId: result.productionId,
    })
    try { fs.unlinkSync(lockPath) } catch (_) { /* ignore */ }

    return { scaffolded: true, ...result }
  } catch (e) {
    console.error('[production-graph] scaffold failed:', e)
    throw e
  }
}

function doScaffold({ bookRoot, bookId, bookTitle, chapters, dir }) {
  const productionId = slugify(bookTitle || bookId || path.basename(bookRoot))
  if (!productionId) {
    throw new Error('scaffold: could not derive production-id')
  }
  const versioningBackend = detectVersioningBackend(bookRoot)
  const now = new Date().toISOString()

  // ── Production ────────────────────────────────────────────────
  const productionUrn = urn(productionId, 'production', 'root')
  const productionRecord = {
    id: productionUrn,
    type: 'production',
    schemaVersion: SCHEMA_VERSION,
    title: bookTitle || bookId || path.basename(bookRoot),
    kind: inferProductionKind(bookRoot),
    bookRoot,
    activeVoice: 'default',
    status: 'in-development',
    versioningBackend,
    eventCoverage: {
      scaffold: now,
      workflow: null,
      jobs: null,
      completeSince: null,
      note: 'null = events for that phase absent; sidecars authoritative for prior history.',
    },
    createdAt: now,
    createdBy: 'galley:system',
    updatedAt: now,
    updatedBy: 'galley:system',
    tags: [],
    refs: {},
  }
  writeJsonAtomic(path.join(dir, 'production.json'), productionRecord, { skipIfExists: true })

  // ── Participant: auteur ───────────────────────────────────────
  const auteurUrn = urn(productionId, 'participant', 'auteur')
  const auteurRecord = {
    id: auteurUrn,
    type: 'participant',
    schemaVersion: SCHEMA_VERSION,
    name: 'The Auteur',
    role: 'writer',
    deviceKeys: [],
    createdAt: now,
    createdBy: 'galley:system',
    updatedAt: now,
    updatedBy: 'galley:system',
    tags: [],
    refs: {},
  }
  writeJsonAtomic(path.join(dir, 'participants', 'auteur.json'), auteurRecord, { skipIfExists: true })

  // Legacy flat-file fan-out (spec line 234).
  const legacyParticipants = path.join(dir, 'participants.json')
  if (fs.existsSync(legacyParticipants)) {
    try {
      const arr = JSON.parse(fs.readFileSync(legacyParticipants, 'utf8'))
      if (Array.isArray(arr)) {
        for (const p of arr) {
          if (!p?.id) continue
          const shortId = String(p.id).split(':').pop()
          if (!shortId) continue
          writeJsonAtomic(
            path.join(dir, 'participants', `${shortId}.json`),
            { ...p, schemaVersion: SCHEMA_VERSION },
            { skipIfExists: true },
          )
        }
      }
      fs.renameSync(legacyParticipants, `${legacyParticipants}.bak`)
    } catch (e) {
      console.error('[production-graph] legacy participants fan-out failed:', e)
    }
  }

  // ── Narrative units ───────────────────────────────────────────
  const bookRootUnitId = 'book-root'
  const bookRootUrn = urn(productionId, 'narrative-unit', bookRootUnitId)
  const bookRootUnit = {
    id: bookRootUrn,
    type: 'narrative-unit',
    schemaVersion: SCHEMA_VERSION,
    kind: 'book',
    title: bookTitle || bookId,
    sourcePath: null,
    status: 'draft',
    createdAt: now,
    createdBy: 'galley:system',
    updatedAt: now,
    updatedBy: 'galley:system',
    tags: [],
    refs: { 'belongs-to': [productionUrn] },
  }
  writeJsonAtomic(
    path.join(dir, 'narrative', `${bookRootUnitId}.json`),
    bookRootUnit,
    { skipIfExists: true },
  )

  const narrativeUnits = []
  const assets = []
  for (const chapter of chapters || []) {
    if (!chapter?.id) continue
    const chapterSlug = slugify(chapter.id)
    if (!chapterSlug) continue
    const sourceRel = relativeToBookRoot(bookRoot, chapter.source_path)

    const narrativeUrn = urn(productionId, 'narrative-unit', chapterSlug)
    const chapterUnit = {
      id: narrativeUrn,
      type: 'narrative-unit',
      schemaVersion: SCHEMA_VERSION,
      kind: 'chapter',
      title: chapter.title || chapter.id,
      sourcePath: sourceRel,
      status: 'draft',
      createdAt: now,
      createdBy: 'galley:system',
      updatedAt: now,
      updatedBy: 'galley:system',
      tags: [],
      refs: { 'belongs-to': [bookRootUrn] },
    }
    writeJsonAtomic(
      path.join(dir, 'narrative', `${chapterSlug}.json`),
      chapterUnit,
      { skipIfExists: true },
    )
    narrativeUnits.push(narrativeUrn)

    if (sourceRel) {
      const assetShortId = `${chapterSlug}-manuscript`
      const assetUrnStr = urn(productionId, 'asset', assetShortId)
      const checksum = checksumFileMaybe(path.join(bookRoot, sourceRel))
      const assetRecord = {
        id: assetUrnStr,
        type: 'asset',
        schemaVersion: SCHEMA_VERSION,
        kind: 'manuscript',
        title: chapter.title || chapter.id,
        sourcePath: sourceRel,
        mimeType: 'text/markdown',
        visibility: 'production',
        accessControl: { allow: [] },
        versions: [
          {
            v: 'v0001',
            createdAt: now,
            createdBy: 'galley:system',
            note: 'scaffold seed',
            checksum,
          },
        ],
        createdAt: now,
        createdBy: 'galley:system',
        updatedAt: now,
        updatedBy: 'galley:system',
        tags: ['manuscript', 'chapter'],
        refs: { 'belongs-to': [narrativeUrn] },
      }
      writeJsonAtomic(
        path.join(dir, 'assets', `${assetShortId}.json`),
        assetRecord,
        { skipIfExists: true },
      )
      assets.push(assetUrnStr)
    }
  }

  // Mark the relationship index dirty (spec line 77).
  writeJsonAtomic(
    path.join(dir, '_index', 'meta.json'),
    {
      schemaVersion: SCHEMA_VERSION,
      lastBuilt: null,
      maxSidecarMtime: null,
      dirty: true,
      dirtyAt: now,
      reason: 'scaffold',
    },
    { skipIfExists: false },
  )

  // ── Single bulk scaffold event ────────────────────────────────
  appendEvent(bookRoot, buildSystemEvent({
    verb: 'scaffold',
    subject: productionUrn,
    summary: `scaffold production "${productionRecord.title}" — ${narrativeUnits.length} narrative units, ${assets.length} assets`,
    extra: {
      counts: {
        narrativeUnits: narrativeUnits.length + 1,
        assets: assets.length,
        participants: 1,
      },
      versioningBackend,
    },
  }))

  return {
    productionId,
    productionUrn,
    counts: {
      narrativeUnits: narrativeUnits.length + 1,
      assets: assets.length,
      participants: 1,
    },
  }
}

function detectVersioningBackend(bookRoot) {
  return fs.existsSync(path.join(bookRoot, '.git')) ? 'git' : 'cache'
}

function inferProductionKind(bookRoot) {
  if (fs.existsSync(path.join(bookRoot, 'screenplay'))) return 'screenplay'
  if (fs.existsSync(path.join(bookRoot, 'panels'))) return 'graphic-novel'
  if (fs.existsSync(path.join(bookRoot, 'storyboard'))) return 'animatic'
  return 'book'
}

function relativeToBookRoot(bookRoot, p) {
  if (!p) return null
  if (path.isAbsolute(p)) {
    const rel = path.relative(bookRoot, p)
    if (rel.startsWith('..')) return null
    return rel
  }
  return p
}

function checksumFileMaybe(filePath) {
  try {
    const data = fs.readFileSync(filePath)
    return 'sha256:' + crypto.createHash('sha256').update(data).digest('hex')
  } catch (_) {
    return null
  }
}
