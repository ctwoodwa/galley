/**
 * Production-graph filesystem I/O.
 *
 *   1. Atomic JSON write — every sidecar is written to a sibling
 *      tempfile then renamed. A crash mid-write leaves either the
 *      old file or no file, never a half-written one.
 *
 *   2. Append-only event log — every state change appends one
 *      JSON object per line to <bookRoot>/.galley/events.jsonl.
 *      Single-writer in v1 (only this book-server process).
 */

import fs from 'fs'
import path from 'path'

import { SYSTEM_SENTINEL, ulid } from './ids.js'

export function galleyDir(bookRoot) { return path.join(bookRoot, '.galley') }

export function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function readJsonDir(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.') || !name.endsWith('.json')) continue
    const p = path.join(dir, name)
    try {
      out.push(JSON.parse(fs.readFileSync(p, 'utf8')))
    } catch (e) {
      console.error(`[production-graph] skipping unreadable sidecar ${p}: ${e.message}`)
    }
  }
  return out
}

export function writeJsonAtomic(filePath, value, { skipIfExists = false } = {}) {
  if (skipIfExists && fs.existsSync(filePath)) {
    return { wrote: false, reason: 'exists' }
  }
  ensureDir(path.dirname(filePath))
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8' })
  try {
    const fd = fs.openSync(tmp, 'r+')
    try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  } catch (_) { /* fsync unsupported on some FSes */ }
  fs.renameSync(tmp, filePath)
  return { wrote: true }
}

export function tryCreateLock(filePath, contentObject) {
  ensureDir(path.dirname(filePath))
  try {
    const fd = fs.openSync(filePath, 'wx')
    try {
      fs.writeSync(fd, JSON.stringify(contentObject, null, 2) + '\n')
      try { fs.fsyncSync(fd) } catch (_) { /* best-effort */ }
    } finally {
      fs.closeSync(fd)
    }
    return true
  } catch (e) {
    if (e.code === 'EEXIST') return false
    throw e
  }
}

export function appendEvent(bookRoot, event) {
  const dir = galleyDir(bookRoot)
  ensureDir(dir)
  const target = path.join(dir, 'events.jsonl')
  const line = JSON.stringify(event) + '\n'
  const fd = fs.openSync(target, 'a')
  try {
    fs.writeSync(fd, line)
    try { fs.fsyncSync(fd) } catch (_) { /* best-effort */ }
  } finally {
    fs.closeSync(fd)
  }
}

export function buildSystemEvent({ verb, subject, summary, extra = {} }) {
  return {
    id: ulid(),
    at: new Date().toISOString(),
    by: SYSTEM_SENTINEL,
    verb,
    subject: subject ?? null,
    summary,
    ...extra,
  }
}
