/**
 * Pure parser for audiobook.py's stdout. Tail-poll fetches the running log
 * (last ~40 lines) and feeds it here every 2s; the result drives the
 * AudiobookProgress card in GeneratePanel and QueuePanel.
 *
 * Why a parser instead of a structured ndjson stream from audiobook.py?
 * audiobook.py predates galley and prints human-readable progress; rather
 * than re-plumb its print path, we accept the lines as a public surface and
 * parse them here. If the format changes, this file is the single anchor.
 *
 * Line shapes (verified against /tmp logs 2026-05-08):
 *   Engine: kokoro (Kokoro-FastAPI direct on Windows GPU box (port 8880…))
 *     base_url: http://desktop-umt08rn:8880/v1
 *     model:    kokoro
 *   Default preset: female-solo  chapter-map: on
 *   => book-2/act-1/ch03-…-edge.md  [preset=X voice=Y speed=1.0 per-sentence]
 *     ch03-…-edge.md: 349 sentences, 27,161 chars
 *       [  1/349]   0.3%  PAUSE 0.70s        0.1s
 *       [240/349]  68.8%   78 chars         48.2s
 *         retry 1/8 after error: BadRequestError(...) (sleep 2s)
 *   Traceback (most recent call last): … (terminal, drops the run)
 *   Manifest: …                                (terminal-success line)
 */

const RX = {
  engine:    /^Engine:\s+(\S+)\s*\((.+)\)\s*$/,
  baseUrl:   /^\s+base_url:\s+(\S+)\s*$/,
  model:     /^\s+model:\s+(\S+)\s*$/,
  defaults:  /^Default preset:\s+(\S+)\s+chapter-map:\s+(on|off)\s*$/,
  chapter:   /^=>\s+(\S+)\s+\[preset=(\S+)\s+voice=(\S+)\s+speed=([\d.]+)(?:\s+(per-sentence))?\]\s*$/,
  totals:    /^\s+\S+:\s+(\d+)\s+sentences?,\s+([\d,]+)\s+chars\s*$/,
  chunk:     /^\s+\[\s*(\d+)\/\s*(\d+)\]\s+([\d.]+)%\s+(.+?)\s+(\d+\.\d+)s\s*$/,
  retry:     /^\s+retry\s+(\d+)\/(\d+)\s+after error:\s*(.+?)\s+\(sleep\s+\d+s\)\s*$/,
  traceback: /^Traceback \(most recent call last\):\s*$/,
  manifest:  /^Manifest:\s+(.+?)\s*$/,
}

export function parseAudiobookLog(text) {
  const lines = (text ?? '').split('\n')
  const out = {
    engine: null,
    engineDesc: null,
    baseUrl: null,
    model: null,
    defaultPreset: null,
    chapterMap: null,

    chapter: null,         // relative md path
    chapterFile: null,     // basename
    preset: null,
    voice: null,
    speed: null,
    perSentence: false,

    totalSentences: null,
    totalChars: null,

    lastIdx: null,
    lastPct: null,
    lastKind: null,        // 'pause' | 'text'
    lastDesc: null,        // raw "PAUSE 0.70s" or "78 chars"
    lastDuration: null,    // seconds since job start, per audiobook.py

    retries: 0,
    lastRetry: null,       // {n, total, error}

    crashed: false,
    crashTail: null,       // last few lines of traceback (≤6)
    manifestPath: null,
  }
  let inTraceback = false
  const tracebackLines = []

  for (const raw of lines) {
    if (inTraceback) { tracebackLines.push(raw); continue }
    let m
    if ((m = RX.engine.exec(raw)))   { out.engine = m[1]; out.engineDesc = m[2] }
    else if ((m = RX.baseUrl.exec(raw))) { out.baseUrl = m[1] }
    else if ((m = RX.model.exec(raw)))   { out.model = m[1] }
    else if ((m = RX.defaults.exec(raw))) { out.defaultPreset = m[1]; out.chapterMap = m[2] }
    else if ((m = RX.chapter.exec(raw))) {
      out.chapter = m[1]
      out.chapterFile = m[1].split('/').pop()
      out.preset = m[2]
      out.voice = m[3]
      out.speed = parseFloat(m[4])
      out.perSentence = !!m[5]
    }
    else if ((m = RX.totals.exec(raw))) {
      out.totalSentences = parseInt(m[1], 10)
      out.totalChars = parseInt(m[2].replace(/,/g, ''), 10)
    }
    else if ((m = RX.chunk.exec(raw))) {
      out.lastIdx = parseInt(m[1], 10)
      out.lastPct = parseFloat(m[3])
      out.lastDesc = m[4].trim()
      out.lastKind = out.lastDesc.startsWith('PAUSE') ? 'pause' : 'text'
      out.lastDuration = parseFloat(m[5])
    }
    else if ((m = RX.retry.exec(raw))) {
      out.retries += 1
      out.lastRetry = { n: parseInt(m[1], 10), total: parseInt(m[2], 10), error: m[3] }
    }
    else if (RX.traceback.test(raw)) {
      out.crashed = true
      inTraceback = true
    }
    else if ((m = RX.manifest.exec(raw))) {
      out.manifestPath = m[1]
    }
  }

  if (tracebackLines.length) {
    out.crashTail = tracebackLines.slice(-6).join('\n').trim()
  }
  return out
}

/**
 * Estimate "lines per second" so the next-update ETA card stays alive
 * even between polls. Caller passes successive parsed states + timestamps.
 */
export function rateFromHistory(history) {
  if (!Array.isArray(history) || history.length < 2) return null
  const first = history[0]
  const last  = history[history.length - 1]
  const dIdx = (last.lastIdx ?? 0) - (first.lastIdx ?? 0)
  const dT   = (last.t - first.t) / 1000
  if (dIdx <= 0 || dT <= 0) return null
  return dIdx / dT
}
