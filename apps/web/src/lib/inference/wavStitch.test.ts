import { describe, it, expect } from 'vitest'
import { stitchWav, stitchBlobs } from './wavStitch'

function makeWavBlob(pcmBytes: number): Blob {
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  view.setUint32(0, 0x52494646, false)   // RIFF
  view.setUint32(4, 36 + pcmBytes, true)
  view.setUint32(8, 0x57415645, false)   // WAVE
  view.setUint32(12, 0x666d7420, false)  // fmt
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)            // PCM
  view.setUint16(22, 1, true)            // mono
  view.setUint32(24, 24000, true)        // sample rate
  view.setUint32(28, 48000, true)        // byte rate
  view.setUint16(32, 2, true)            // block align
  view.setUint16(34, 16, true)           // bit depth
  view.setUint32(36, 0x64617461, false)  // data
  view.setUint32(40, pcmBytes, true)
  const pcm = new Uint8Array(pcmBytes).fill(0x42)
  return new Blob([header, pcm], { type: 'audio/wav' })
}

describe('stitchWav', () => {
  it('concatenates PCM and writes correct RIFF header', async () => {
    const blob1 = makeWavBlob(100)
    const blob2 = makeWavBlob(200)
    const result = await stitchWav([blob1, blob2])
    expect(result.type).toBe('audio/wav')
    expect(result.size).toBe(44 + 300)
    const ab = await result.arrayBuffer()
    const view = new DataView(ab)
    expect(view.getUint32(40, true)).toBe(300) // data chunk size
    expect(view.getUint32(4, true)).toBe(336)  // RIFF size = 36 + 300
  })
})

describe('stitchBlobs', () => {
  it('uses stitchWav for wav format', async () => {
    const result = await stitchBlobs([makeWavBlob(100)], 'wav')
    expect(result.type).toBe('audio/wav')
  })

  it('concatenates directly for mp3', async () => {
    const b1 = new Blob(['abc'], { type: 'audio/mpeg' })
    const b2 = new Blob(['def'], { type: 'audio/mpeg' })
    const result = await stitchBlobs([b1, b2], 'mp3')
    expect(result.type).toBe('audio/mpeg')
    expect(result.size).toBe(6)
  })
})
