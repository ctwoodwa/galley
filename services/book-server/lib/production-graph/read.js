/**
 * Production-graph read paths.
 *
 * B.1 is read-only. The single public endpoint returns the entire
 * graph for one production: production record, participants,
 * narrative units, assets, plus empty arrays for the B.2+ kinds
 * (tasks / approvals / comments / publishes / jobs) so the client
 * contract is stable across phases.
 */

import fs from 'fs'
import path from 'path'

import { galleyDir, readJson, readJsonDir } from './io.js'
import { ensureIndexFresh } from './index-builder.js'

export function readGraph(bookRoot) {
  const dir = galleyDir(bookRoot)
  if (!fs.existsSync(dir)) return { scaffolded: false }

  const production = readJson(path.join(dir, 'production.json'))
  if (!production) return { scaffolded: false }

  const indexMeta = ensureIndexFresh(bookRoot)

  return {
    scaffolded: true,
    production,
    participants:   filterDeleted(readJsonDir(path.join(dir, 'participants'))),
    narrativeUnits: filterDeleted(readJsonDir(path.join(dir, 'narrative'))),
    assets:         filterDeleted(readJsonDir(path.join(dir, 'assets'))),
    tasks:          filterDeleted(readJsonDir(path.join(dir, 'tasks'))),
    approvals:      filterDeleted(readJsonDir(path.join(dir, 'approvals'))),
    comments:       filterDeleted(readJsonDir(path.join(dir, 'comments'))),
    publishes:      filterDeleted(readJsonDir(path.join(dir, 'publishes'))),
    jobs:           filterDeleted(readJsonDir(path.join(dir, 'jobs'))),
    _index: {
      lastBuilt: indexMeta?.lastBuilt ?? null,
      dirty: indexMeta?.dirty ?? true,
      objectCount: indexMeta?.objectCount ?? 0,
    },
  }
}

function filterDeleted(records) {
  return (records || []).filter((r) => !r.deletedAt)
}
