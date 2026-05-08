import { describe, it, expect } from 'vitest'
import { splitText } from './chunker'

describe('splitText', () => {
  it('returns single chunk when text fits', () => {
    expect(splitText('Hello world.', 750)).toEqual(['Hello world.'])
  })

  it('splits on paragraph boundaries first', () => {
    const text = 'Para one.\n\nPara two.\n\nPara three.'
    const chunks = splitText(text, 20)
    expect(chunks).toEqual(['Para one.', 'Para two.', 'Para three.'])
  })

  it('merges short paragraphs that fit in one chunk', () => {
    const text = 'Short.\n\nAlso short.'
    const chunks = splitText(text, 750)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toContain('Short.')
    expect(chunks[0]).toContain('Also short.')
  })

  it('splits long paragraph on sentence boundaries', () => {
    const sentence = 'The quick brown fox jumps. '
    const longPara = sentence.repeat(40) // ~1040 chars
    const chunks = splitText(longPara, 500)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500 + 50) // tighter: above one sentence but near the limit
    }
  })

  it('filters empty chunks', () => {
    expect(splitText('   \n\n   ', 750)).toEqual([])
  })
})
