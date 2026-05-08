import type { ImageGenerateParams, ImageStatus, ComfyImageResult } from './imageTypes'

/**
 * Typed client for the image-generation surface of the Windows inference API.
 * All endpoints under `/api/v1/image/*`. Backend is ComfyUI-style (returns a
 * `prompt_id` you poll until status === 'done').
 */
export class ImageClient {
  constructor(
    readonly baseUrl: string,
    readonly apiKey: string = '',
  ) {}

  private auth(): Record<string, string> {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}
  }

  async generate(params: ImageGenerateParams): Promise<{ prompt_id: string }> {
    const res = await fetch(`${this.baseUrl}/api/v1/image/generate`, {
      method: 'POST',
      headers: { ...this.auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => String(res.status))
      throw Object.assign(new Error(text), { status: res.status })
    }
    return res.json() as Promise<{ prompt_id: string }>
  }

  async getStatus(promptId: string): Promise<ImageStatus> {
    const res = await fetch(`${this.baseUrl}/api/v1/image/status/${promptId}`, {
      headers: this.auth(),
    })
    if (!res.ok) {
      throw Object.assign(new Error(`Status check failed: ${res.status}`), { status: res.status })
    }
    return res.json() as Promise<ImageStatus>
  }

  async waitForCompletion(
    promptId: string,
    timeout = 180_000,
    onTick?: () => void,
  ): Promise<ComfyImageResult> {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const status = await this.getStatus(promptId)
      if (status.status === 'done' && status.images?.length) {
        return status.images[0]
      }
      if (status.status === 'error') {
        throw new Error(status.error ?? 'Image generation failed')
      }
      onTick?.()
      await new Promise<void>((resolve) => setTimeout(resolve, 2000))
    }
    throw new Error('Generation timed out after 3 minutes')
  }

  viewUrl(filename: string, subfolder = ''): string {
    const params = new URLSearchParams({ filename, subfolder, type: 'output' })
    return `${this.baseUrl}/api/v1/image/view?${params}`
  }
}
