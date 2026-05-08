export const CHUNK_SIZES = {
  conservative: 500,
  recommended: 750,
  aggressive: 1200,
} as const

export type ChunkSize = keyof typeof CHUNK_SIZES

export function splitText(text: string, targetChars: number): string[] {
  const paragraphs = text.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    if (current.length + trimmed.length + 2 < targetChars) {
      current = current ? `${current}\n\n${trimmed}` : trimmed
    } else if (trimmed.length <= targetChars) {
      if (current) chunks.push(current)
      current = trimmed
    } else {
      if (current) { chunks.push(current); current = '' }
      // Split on sentence boundaries
      const sentences = trimmed.match(/[^.!?]+[.!?]+\s*/g) ?? [trimmed]
      for (const sentence of sentences) {
        if (current.length + sentence.length <= targetChars) {
          current += sentence
        } else {
          if (current) chunks.push(current.trim())
          current = sentence
        }
        // Word-level fallback: if current is itself oversized, split on spaces
        while (current.length > targetChars) {
          const words = current.split(' ')
          let part = ''
          let remaining = current
          for (let w = 0; w < words.length; w++) {
            const candidate = part ? `${part} ${words[w]}` : words[w]
            if (candidate.length <= targetChars) {
              part = candidate
            } else {
              if (part) chunks.push(part.trim())
              part = words[w]
            }
          }
          current = part
          // If a single word exceeds targetChars, break to avoid infinite loop
          if (current === remaining) break
        }
      }
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(c => c.length > 0)
}
