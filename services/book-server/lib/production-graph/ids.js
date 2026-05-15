/**
 * Production-graph ID + slug utilities.
 *
 * URN scheme (per docs/architecture/galley-production-graph.md):
 *
 *   Production-scoped objects:
 *     galley:<production-id>:<type>:<short-id>
 *
 *   System sentinel (event 'by' field only):
 *     galley:system
 *
 * Production-id is an immutable slug derived once at scaffold time
 * from the initial book title. Renaming the book does not change it.
 */

export const TYPE_TAGS = [
  'production',
  'narrative-unit',
  'asset',
  'task',
  'participant',
  'publish',
  'approval',
  'comment',
  'job',
]

export const SYSTEM_SENTINEL = 'galley:system'

/**
 * Slugify a string per the spec's production-id rules: lowercase,
 * non-alphanumeric → '-', max 48 chars, no leading / trailing '-'.
 */
export function slugify(input, maxLen = 48) {
  if (input == null) return ''
  const stripped = String(input)
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return stripped.slice(0, maxLen).replace(/-+$/, '')
}

/**
 * Crockford-base32 ULID — 26 chars, time-sortable. Not for security
 * decisions; Math.random is sufficient for namespace separation.
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export function ulid(now = Date.now()) {
  let t = now
  let time = ''
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time
    t = Math.floor(t / 32)
  }
  let rand = ''
  for (let i = 0; i < 16; i++) {
    rand += CROCKFORD[Math.floor(Math.random() * 32)]
  }
  return time + rand
}

export function urn(productionId, type, shortId) {
  if (!productionId) throw new Error('urn: productionId required')
  if (!TYPE_TAGS.includes(type)) throw new Error(`urn: invalid type "${type}"`)
  if (!shortId) throw new Error('urn: shortId required')
  return `galley:${productionId}:${type}:${shortId}`
}

export function parseUrn(s) {
  if (typeof s !== 'string') return null
  if (s === SYSTEM_SENTINEL) return { system: true }
  const parts = s.split(':')
  if (parts.length !== 4 || parts[0] !== 'galley') return null
  const [, productionId, type, shortId] = parts
  if (!TYPE_TAGS.includes(type)) return null
  return { productionId, type, shortId }
}
