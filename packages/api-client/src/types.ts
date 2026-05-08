/* TTS types — mirror /api/v1/audio/* on the Windows inference server. */

export interface HealthResponse {
  status: 'ok' | 'loading'
  model_loaded: boolean
  queue_depth: number
  vram_used_gb: number
}

export interface VoiceInfo {
  id: string
  transcript: string
  sample_rate: number
  is_stock: boolean
}

export interface VoiceMetadata {
  id: string
  is_stock: boolean
  display_name?: string
  transcript: string
  language?: string
  sample_rate: number
  duration_seconds?: number
  notes?: string
  uploaded_at?: string
}

export interface VoicesResponse {
  voices: VoiceInfo[]
}

export type AudioFormat = 'mp3' | 'wav' | 'flac' | 'pcm'

export type ModelId = 'higgs' | 'kokoro'

export type ServiceId = 'music' | 'tts' | 'image' | 'stt'

export const KOKORO_VOICES = [
  'af_heart', 'af_bella', 'af_sarah', 'af_sky', 'af_nova',
  'am_adam', 'am_michael', 'am_echo',
  'bf_emma', 'bf_isabella',
  'bm_george', 'bm_lewis',
] as const

export interface SpeechRequest {
  model: ModelId
  input: string
  voice: string
  response_format: AudioFormat
  speed?: number
  exaggeration?: number
  cfg_weight?: number
  temperature?: number
}

export interface KnobValues {
  exaggeration: number
  cfg_weight: number
  temperature: number
  speed: number
}

export interface ApiError {
  status: number
  message: string
}
