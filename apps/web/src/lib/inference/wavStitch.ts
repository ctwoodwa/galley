function buildWavHeader(
  dataLength: number,
  sampleRate = 24000,
  numChannels = 1,
  bitDepth = 16,
): ArrayBuffer {
  const header = new ArrayBuffer(44)
  const v = new DataView(header)
  const byteRate = (sampleRate * numChannels * bitDepth) / 8
  const blockAlign = (numChannels * bitDepth) / 8

  v.setUint32(0,  0x52494646, false) // "RIFF"
  v.setUint32(4,  36 + dataLength, true)
  v.setUint32(8,  0x57415645, false) // "WAVE"
  v.setUint32(12, 0x666d7420, false) // "fmt "
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)           // PCM
  v.setUint16(22, numChannels, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, byteRate, true)
  v.setUint16(32, blockAlign, true)
  v.setUint16(34, bitDepth, true)
  v.setUint32(36, 0x64617461, false) // "data"
  v.setUint32(40, dataLength, true)

  return header
}

export async function stitchWav(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) throw new Error('stitchWav: no blobs to stitch')
  const pcmChunks: ArrayBuffer[] = []
  for (let i = 0; i < blobs.length; i++) {
    const ab = await blobs[i].arrayBuffer()
    if (ab.byteLength < 44) {
      throw new Error(`stitchWav: blob[${i}] is ${ab.byteLength} bytes — too short to be a valid WAV`)
    }
    pcmChunks.push(ab.slice(44))
  }
  const totalPcm = pcmChunks.reduce((sum, ab) => sum + ab.byteLength, 0)
  const header = buildWavHeader(totalPcm)
  return new Blob([header, ...pcmChunks], { type: 'audio/wav' })
}

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  pcm: 'audio/pcm',
}

export async function stitchBlobs(blobs: Blob[], format: string): Promise<Blob> {
  if (format === 'wav') return stitchWav(blobs)
  return new Blob(blobs, { type: MIME[format] ?? 'application/octet-stream' })
}
