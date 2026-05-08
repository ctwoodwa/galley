export interface TranscribeOptions {
  /** Whisper model id. Default: 'whisper-1'. */
  model?: string
  /** ISO 639-1 language code, or 'auto'. Default: 'auto'. */
  language?: string
  /** OpenAI-compatible response format. Default: 'verbose_json'. */
  response_format?: 'json' | 'verbose_json' | 'text' | 'srt' | 'vtt'
  /** Filename surfaced to the server. Default: 'recording.webm'. */
  filename?: string
}

export interface TranscriptionResult {
  text: string
  language?: string
  duration?: number
}

/**
 * Typed client for the speech-to-text surface of the Windows inference API.
 * Endpoint: POST /api/v1/audio/transcriptions (OpenAI-compatible Whisper shape).
 *
 * Used by the DictationButton component for hands-free note/prose entry,
 * and by the inference-studio STT panel for arbitrary audio transcription.
 */
export class SttClient {
  constructor(
    readonly baseUrl: string,
    readonly apiKey: string = '',
  ) {}

  private auth(headers: Headers = new Headers()): Headers {
    if (this.apiKey) headers.set('Authorization', `Bearer ${this.apiKey}`)
    return headers
  }

  async transcribe(audio: Blob, opts: TranscribeOptions = {}): Promise<TranscriptionResult> {
    const fd = new FormData()
    fd.append('file', audio, opts.filename ?? 'recording.webm')
    fd.append('model', opts.model ?? 'whisper-1')
    fd.append('language', opts.language ?? 'auto')
    fd.append('response_format', opts.response_format ?? 'verbose_json')

    const res = await fetch(`${this.baseUrl}/api/v1/audio/transcriptions`, {
      method: 'POST',
      headers: this.auth(),
      body: fd,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => String(res.status))
      throw Object.assign(new Error(text), { status: res.status })
    }
    const data = (await res.json()) as TranscriptionResult
    return data
  }
}
