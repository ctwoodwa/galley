/**
 * Relationship index builder.
 *
 * The index lives at <bookRoot>/.galley/_index/ and is purely
 * derived from sidecars + events.jsonl. Per spec lines 75-80:
 *
 *   1. Startup — check _index/meta.json. If absent / stale /
 *      dirty, rebuild lazily on next read.
 *   2. Any sidecar write — mark dirty, do NOT rebuild
 *      synchronously.
 *   3. Any read — if dirty, rebuild then serve.
 *   4. Explicit flush — DELETE the index dir.
 *   5. In-process cache — invalidate on _index/meta.json mtime.
 */

import fs from 'fs'
import path from 'path'

import {
  galleyDir,
  ensureDir,
  readJson,
  readJsonDir,
  writeJsonAtomic,
} from './io.js'

const SCHEMA_VERSION = 1

const INDEXED_KINDS = [
  { dir: 'narrative',    type: 'narrative-unit' },
  { dir: 'assets',       type: 'asset' },
  { dir: 'tasks',        type: 'task' },
  { dir: 'participants', type: 'participant' },
  { dir: 'publishes',    type: 'publish' },
  { dir: 'approvals',    type: 'approval' },
  { dir: 'comments',     type: 'comment' },
  { dir: 'jobs',         type: 'job' },
]

const REVERSE_NAMES = {
  'belongs-to':   'contains',
  'depends-on':   'blocked-by',
  'derived-from': 'derived-into',
  'blocks':       'blocked-by',
  'supersedes':   'superseded-by',
  'consumes':     'consumed-by',
  'publishes-to': 'published-from',
}

export function readMeta(bookRoot) {
  return readJson(path.join(galleyDir(bookRoot), '_index', 'meta.json'))
}

export function markDirty(bookRoot, reason) {
  const existing = readMeta(bookRoot) || {
    schemaVersion: SCHEMA_VERSION,
    lastBuilt: null,
    maxSidecarMtime: null,
  }
  writeJsonAtomic(path.join(galleyDir(bookRoot), '_index', 'meta.json'), {
    ...existing,
    dirty: true,
    dirtyAt: new Date().toISOString(),
    reason: reason || existing.reason || 'unknown',
  })
}

export function ensureIndexFresh(bookRoot) {
  const meta = readMeta(bookRoot)
  if (meta && meta.dirty === false && meta.schemaVersion === SCHEMA_VERSION) {
    return meta
  }
  return rebuildIndex(bookRoot)
}

export function rebuildIndex(bookRoot) {
  const dir = galleyDir(bookRoot)
  const indexDir = path.join(dir, '_index')
  ensureDir(indexDir)

  const production = readJson(path.join(dir, 'production.json'))
  const objects = {}
  if (production) objects[production.id] = { type: 'production', record: production }
  for (const k of INDEXED_KINDS) {
    for (const rec of readJsonDir(path.join(dir, k.dir))) {
      if (!rec?.id) continue
      if (rec.deletedAt) continue  // soft-deleted; spec line 559
      objects[rec.id] = { type: k.type, record: rec }
    }
  }

  const forward = {}
  const reverse = {}
  for (const [id, { record }] of Object.entries(objects)) {
    const refs = record.refs || {}
    forward[id] = {}
    for (const [verb, targets] of Object.entries(refs)) {
      if (!Array.isArray(targets) || targets.length === 0) continue
      forward[id][verb] = [...targets]
      const reverseVerb = REVERSE_NAMES[verb]
      if (!reverseVerb) continue
      for (const target of targets) {
        if (!reverse[target]) reverse[target] = {}
        if (!reverse[target][reverseVerb]) reverse[target][reverseVerb] = []
        reverse[target][reverseVerb].push(id)
      }
    }
  }

  const byType = {}
  for (const [id, { type }] of Object.entries(objects)) {
    if (!byType[type]) byType[type] = []
    byType[type].push(id)
  }

  const now = new Date().toISOString()
  const newMeta = {
    schemaVersion: SCHEMA_VERSION,
    lastBuilt: now,
    maxSidecarMtime: maxSidecarMtime(dir),
    dirty: false,
    dirtyAt: null,
    reason: null,
    objectCount: Object.keys(objects).length,
  }

  writeJsonAtomic(path.join(indexDir, 'relationships.json'), {
    schemaVersion: SCHEMA_VERSION,
    lastBuilt: now,
    forward,
    reverse,
    byType,
  })
  writeJsonAtomic(path.join(indexDir, 'meta.json'), newMeta)

  return newMeta
}

function maxSidecarMtime(galleyDirPath) {
  let max = 0
  for (const k of INDEXED_KINDS) {
    const subdir = path.join(galleyDirPath, k.dir)
    if (!fs.existsSync(subdir)) continue
    for (const name of fs.readdirSync(subdir)) {
      if (!name.endsWith('.json')) continue
      try {
        const m = fs.statSync(path.join(subdir, name)).mtimeMs
        if (m > max) max = m
      } catch (_) { /* ignore */ }
    }
  }
  const prod = path.join(galleyDirPath, 'production.json')
  if (fs.existsSync(prod)) {
    try {
      const m = fs.statSync(prod).mtimeMs
      if (m > max) max = m
    } catch (_) { /* ignore */ }
  }
  return max ? new Date(max).toISOString() : null
}
