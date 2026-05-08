import type { VoiceMetadata } from '@galley/api-client'

const LANG: Record<string, string> = {
  a: 'American English',
  b: 'British English',
  e: 'Spanish',
  f: 'French',
  h: 'Hindi',
  i: 'Italian',
  j: 'Japanese',
  p: 'Brazilian Portuguese',
  z: 'Mandarin Chinese',
}

export function kokoroVoiceMeta(id: string): VoiceMetadata {
  const langKey = id[0]?.toLowerCase() ?? ''
  const genderKey = id[1]?.toLowerCase() ?? ''
  const name = id.slice(3)

  const region = LANG[langKey] ?? 'Unknown'
  const gender = genderKey === 'f' ? 'Female' : genderKey === 'm' ? 'Male' : 'Unknown'
  const display_name = name.charAt(0).toUpperCase() + name.slice(1)

  return {
    id,
    display_name,
    language: region,
    notes: `${region} · ${gender}`,
    transcript: '',
    sample_rate: 24000,
    is_stock: true,
  }
}
