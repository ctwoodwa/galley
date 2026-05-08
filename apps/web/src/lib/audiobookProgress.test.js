import { describe, expect, it } from 'vitest'
import { parseAudiobookLog, rateFromHistory } from './audiobookProgress'

const HEADER = `Engine: kokoro (Kokoro-FastAPI direct on Windows GPU box (port 8880; ~8× faster than Mac CPU; default as of 2026-05-07))
  base_url: http://desktop-umt08rn:8880/v1
  model:    kokoro
Default preset: female-solo  chapter-map: on

=> book-2/act-1/ch03-drake-passage-ice-edge.md  [preset=female-solo voice=af_bella speed=1.0 per-sentence]
  ch03-drake-passage-ice-edge.md: 349 sentences, 27,161 chars
`

describe('parseAudiobookLog', () => {
  it('parses the header block', () => {
    const p = parseAudiobookLog(HEADER)
    expect(p.engine).toBe('kokoro')
    expect(p.engineDesc).toMatch(/Kokoro-FastAPI/)
    expect(p.baseUrl).toBe('http://desktop-umt08rn:8880/v1')
    expect(p.model).toBe('kokoro')
    expect(p.defaultPreset).toBe('female-solo')
    expect(p.chapterMap).toBe('on')
    expect(p.chapter).toBe('book-2/act-1/ch03-drake-passage-ice-edge.md')
    expect(p.chapterFile).toBe('ch03-drake-passage-ice-edge.md')
    expect(p.preset).toBe('female-solo')
    expect(p.voice).toBe('af_bella')
    expect(p.speed).toBe(1.0)
    expect(p.perSentence).toBe(true)
    expect(p.totalSentences).toBe(349)
    expect(p.totalChars).toBe(27161)
  })

  it('parses a chunk progress line (text)', () => {
    const log = HEADER + '    [240/349]  68.8%   78 chars         48.2s\n'
    const p = parseAudiobookLog(log)
    expect(p.lastIdx).toBe(240)
    expect(p.lastPct).toBeCloseTo(68.8)
    expect(p.lastKind).toBe('text')
    expect(p.lastDesc).toBe('78 chars')
    expect(p.lastDuration).toBeCloseTo(48.2)
  })

  it('parses a chunk progress line (PAUSE)', () => {
    const log = HEADER + '    [  1/349]   0.3%  PAUSE 0.70s        0.1s\n'
    const p = parseAudiobookLog(log)
    expect(p.lastIdx).toBe(1)
    expect(p.lastKind).toBe('pause')
    expect(p.lastDesc).toBe('PAUSE 0.70s')
    expect(p.lastDuration).toBeCloseTo(0.1)
  })

  it('counts retry lines and captures the last error', () => {
    const log = HEADER + `      retry 1/8 after error: BadRequestError('foo') (sleep 2s)
      retry 2/8 after error: BadRequestError('bar') (sleep 4s)
`
    const p = parseAudiobookLog(log)
    expect(p.retries).toBe(2)
    expect(p.lastRetry).toEqual({ n: 2, total: 8, error: "BadRequestError('bar')" })
  })

  it('captures crash + traceback tail', () => {
    const log = HEADER + `Traceback (most recent call last):
  File "audiobook.py", line 1909, in main
    entry = render_chapter(...)
  File "audiobook.py", line 1632, in render_chapter
    "audio": _to_rel(out_path),
ValueError: not in subpath
`
    const p = parseAudiobookLog(log)
    expect(p.crashed).toBe(true)
    expect(p.crashTail).toMatch(/ValueError/)
  })

  it('captures the manifest path on success', () => {
    const log = HEADER + 'Manifest: build/the-inverted-stack/output/audiobook/_manifest.json\n'
    const p = parseAudiobookLog(log)
    expect(p.manifestPath).toBe('build/the-inverted-stack/output/audiobook/_manifest.json')
    expect(p.crashed).toBe(false)
  })

  it('handles empty input cleanly', () => {
    const p = parseAudiobookLog('')
    expect(p.engine).toBeNull()
    expect(p.totalSentences).toBeNull()
    expect(p.lastIdx).toBeNull()
    expect(p.retries).toBe(0)
    expect(p.crashed).toBe(false)
  })

  it('handles undefined input cleanly', () => {
    const p = parseAudiobookLog(undefined)
    expect(p.engine).toBeNull()
  })

  it('keeps only the most recent chunk progress (parser is stateless across polls)', () => {
    const log = HEADER + `    [100/349]  28.7%   45 chars         15.0s
    [101/349]  29.0%   38 chars         15.2s
    [102/349]  29.2%   PAUSE 0.50s      15.3s
`
    const p = parseAudiobookLog(log)
    expect(p.lastIdx).toBe(102)
    expect(p.lastKind).toBe('pause')
  })
})

describe('rateFromHistory', () => {
  it('returns null for fewer than 2 samples', () => {
    expect(rateFromHistory([])).toBeNull()
    expect(rateFromHistory([{ lastIdx: 5, t: 1000 }])).toBeNull()
  })

  it('computes sentences-per-second from first→last samples', () => {
    const history = [
      { lastIdx: 100, t: 0 },
      { lastIdx: 110, t: 5_000 },
      { lastIdx: 120, t: 10_000 },
    ]
    expect(rateFromHistory(history)).toBeCloseTo(2)  // (120-100) / 10s
  })

  it('returns null when index has not advanced', () => {
    const history = [
      { lastIdx: 50, t: 0 },
      { lastIdx: 50, t: 5_000 },
    ]
    expect(rateFromHistory(history)).toBeNull()
  })

  it('rejects non-array input', () => {
    expect(rateFromHistory(null)).toBeNull()
    expect(rateFromHistory(undefined)).toBeNull()
  })
})
