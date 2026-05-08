import type {
  HealthResponse,
  VoiceMetadata,
  VoicesResponse,
  SpeechRequest,
  VoiceInfo,
} from './types'
import { HealthResponseSchema, VoicesResponseSchema } from './schemas'

/**
 * Backend flavor — controls the path prefix and response-shape normalization
 * for the two TTS surfaces galley targets:
 *
 *   - 'standard'      → Remote GPU API (e.g. http://desktop-umt08rn:8881)
 *                       paths /api/v1/audio/*, /api/v1/health
 *                       voices: [{id, transcript, sample_rate, is_stock}]
 *
 *   - 'kokoro-local'  → kokoro-fastapi Docker on localhost:8880
 *                       paths /v1/audio/*, /health
 *                       voices: ["af_alloy", "af_aoede", ...]  (string array)
 *                       health: {"status": "healthy"}
 */
export type TTSFlavor = 'standard' | 'kokoro-local'

interface FlavorConfig {
  pathPrefix: string
  healthPath: string
  voicesNeedNormalization: boolean
  healthNeedsNormalization: boolean
}

const FLAVORS: Record<TTSFlavor, FlavorConfig> = {
  standard: {
    pathPrefix: '/api/v1',
    healthPath: '/api/v1/health',
    voicesNeedNormalization: false,
    healthNeedsNormalization: false,
  },
  'kokoro-local': {
    pathPrefix: '/v1',
    healthPath: '/health',
    voicesNeedNormalization: true,
    healthNeedsNormalization: true,
  },
}

/**
 * Typed client for the TTS / audio surface. The Windows GPU server and
 * the local Kokoro Docker have slightly different URL prefixes and
 * response shapes; the `flavor` arg picks the right adapter so callers
 * see a uniform Promise<HealthResponse> / Promise<VoicesResponse> /
 * Promise<Blob> contract.
 */
export class TTSClient {
  readonly flavor: TTSFlavor
  private readonly cfg: FlavorConfig

  constructor(
    readonly baseUrl: string,
    readonly apiKey: string,
    flavor: TTSFlavor = 'standard',
  ) {
    this.flavor = flavor
    this.cfg = FLAVORS[flavor]
  }

  private auth(): Record<string, string> {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}
  }

  async health(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}${this.cfg.healthPath}`)
    if (!res.ok) throw Object.assign(new Error('Health check failed'), { status: res.status })
    const raw = await res.json()
    if (this.cfg.healthNeedsNormalization) {
      // Local Kokoro returns {"status": "healthy"} — normalize.
      return {
        status: raw.status === 'healthy' ? 'ok' : 'loading',
        model_loaded: raw.status === 'healthy',
        queue_depth: 0,
        vram_used_gb: 0,
      }
    }
    return HealthResponseSchema.parse(raw)
  }

  async listVoices(refresh = false, model?: string): Promise<VoicesResponse> {
    const params = new URLSearchParams()
    if (refresh) params.set('refresh', '1')
    if (model) params.set('model', model)
    const qs = params.toString()
    const url = `${this.baseUrl}${this.cfg.pathPrefix}/audio/voices${qs ? '?' + qs : ''}`
    const res = await fetch(url, { headers: this.auth() })
    if (!res.ok) throw Object.assign(new Error(`List voices: ${res.status}`), { status: res.status })
    const raw = await res.json()
    if (this.cfg.voicesNeedNormalization) {
      // Local Kokoro returns {"voices": ["af_alloy", "af_aoede", ...]}
      const ids = (raw.voices ?? []) as string[]
      const voices: VoiceInfo[] = ids.map((id) => ({
        id,
        transcript: '',
        sample_rate: 24000,
        is_stock: true,
      }))
      return { voices }
    }
    return VoicesResponseSchema.parse(raw)
  }

  async getVoice(id: string): Promise<VoiceMetadata> {
    if (this.flavor === 'kokoro-local') {
      // Local Kokoro has no per-voice metadata endpoint; synthesize a minimal record.
      return {
        id,
        is_stock: true,
        transcript: '',
        sample_rate: 24000,
      }
    }
    const res = await fetch(`${this.baseUrl}${this.cfg.pathPrefix}/audio/voices/${id}`, {
      headers: this.auth(),
    })
    if (!res.ok) throw Object.assign(new Error(`Get voice: ${res.status}`), { status: res.status })
    return res.json() as Promise<VoiceMetadata>
  }

  async uploadVoice(
    voiceId: string,
    formData: FormData,
  ): Promise<{ status: number; data: VoiceMetadata }> {
    if (this.flavor === 'kokoro-local') {
      throw new Error('Voice upload is not supported on the local Kokoro Docker (stock voices only)')
    }
    const res = await fetch(`${this.baseUrl}${this.cfg.pathPrefix}/audio/voices/${voiceId}`, {
      method: 'PUT',
      headers: this.auth(),
      body: formData,
    })
    const data = (await res.json()) as VoiceMetadata
    return { status: res.status, data }
  }

  async deleteVoice(voiceId: string): Promise<void> {
    if (this.flavor === 'kokoro-local') {
      throw new Error('Voice delete is not supported on the local Kokoro Docker (stock voices only)')
    }
    const res = await fetch(`${this.baseUrl}${this.cfg.pathPrefix}/audio/voices/${voiceId}`, {
      method: 'DELETE',
      headers: this.auth(),
    })
    if (!res.ok) throw Object.assign(new Error(`Delete voice: ${res.status}`), { status: res.status })
  }

  async synthesize(req: SpeechRequest): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}${this.cfg.pathPrefix}/audio/speech`, {
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
