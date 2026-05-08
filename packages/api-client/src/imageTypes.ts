/* Image-generation types — mirror /api/v1/image/* on the Windows inference server. */

export interface ImageGenerateParams {
  prompt: string
  negative_prompt?: string
  width: number
  height: number
  steps: number
  seed: number
}

export interface ComfyImageResult {
  filename: string
  subfolder: string
  type: string
}

export interface ImageStatus {
  status: 'pending' | 'processing' | 'done' | 'error'
  images?: ComfyImageResult[]
  error?: string
}

export interface GeneratedImage {
  url: string
  prompt: string
  width: number
  height: number
  timestamp: number
}
