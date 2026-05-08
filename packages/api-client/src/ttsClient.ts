import type {
  HealthResponse,
  VoiceMetadata,
  VoicesResponse,
  SpeechRequest,
} from './types'
import { HealthResponseSchema, VoicesResponseSchema } from './schemas'

/**
 * Typed client for the TTS / audio surface of the Windows inference API.
 * All endpoints under `/api/v1/audio/*` plus the global `/api/v1/health`.
 */
export class TTSClient {
  constructor(
    readonly baseUrl: string,
    readonly apiKey: string,
  ) {}

  private auth(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` }
  }

  async health(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}/api/v1/health`)
    if (!res.ok) throw Object.assign(new Error('Health check failed'), { status: res.status })
    return HealthResponseSchema.parse(await res.json())
  }

  async listVoices(refresh = false, model?: string): Promise<VoicesResponse> {
    const params = new URLSearchParams()
    if (refresh) params.set('refresh', '1')
    if (model) params.set('model', model)
    const qs = params.toString()
    const url = `${this.baseUrl}/api/v1/audio/voices${qs ? '?' + qs : ''}`
    const res = await fetch(url, { headers: this.auth() })
    if (!res.ok) throw Object.assign(new Error(`List voices: ${res.status}`), { status: res.status })
    return VoicesResponseSchema.parse(await res.json())
  }

  async getVoice(id: string): Promise<VoiceMetadata> {
    const res = await fetch(`${this.baseUrl}/api/v1/audio/voices/${id}`, {
      headers: this.auth(),
    })
    if (!res.ok) throw Object.assign(new Error(`Get voice: ${res.status}`), { status: res.status })
    return res.json() as Promise<VoiceMetadata>
  }

  async uploadVoice(
    voiceId: string,
    formData: FormData,
  ): Promise<{ status: number; data: VoiceMetadata }> {
    const res = await fetch(`${this.baseUrl}/api/v1/audio/voices/${voiceId}`, {
      method: 'PUT',
      headers: this.auth(),
      body: formData,
    })
    const data = (await res.json()) as VoiceMetadata
    return { status: res.status, data }
  }

  async deleteVoice(voiceId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/audio/voices/${voiceId}`, {
      method: 'DELETE',
      headers: this.auth(),
    })
    if (!res.ok) throw Object.assign(new Error(`Delete voice: ${res.status}`), { status: res.status })
  }

  async synthesize(req: SpeechRequest): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/api/v1/audio/speech`, {
      method: 'POST',
      headers: { ...this.auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => String(res.status))
      throw Object.assign(new Error(text), { status: res.status })
    }
    return res.blob()
  }
}
