import { z } from 'zod'

/**
 * Defensive Zod schemas for parsing untyped JSON from the Windows inference
 * API. Use `Schema.parse(await res.json())` to fail loudly on drift; use
 * `Schema.safeParse(...)` if the caller wants to handle malformed responses.
 *
 * The API server's OpenAPI spec is just a passthrough proxy, so wire shapes
 * can drift silently. These schemas are the contract galley enforces.
 */

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'loading']),
  model_loaded: z.boolean(),
  queue_depth: z.number(),
  vram_used_gb: z.number(),
})

export const VoiceInfoSchema = z.object({
  id: z.string(),
  transcript: z.string(),
  sample_rate: z.number(),
  is_stock: z.boolean(),
})

export const VoicesResponseSchema = z.object({
  voices: z.array(VoiceInfoSchema),
})

export const VoiceMetadataSchema = z.object({
  id: z.string(),
  is_stock: z.boolean(),
  display_name: z.string().optional(),
  transcript: z.string(),
  language: z.string().optional(),
  sample_rate: z.number(),
  duration_seconds: z.number().optional(),
  notes: z.string().optional(),
  uploaded_at: z.string().optional(),
})

export const ImageStatusSchema = z.object({
  status: z.enum(['pending', 'processing', 'done', 'error']),
  images: z
    .array(
      z.object({
        filename: z.string(),
        subfolder: z.string(),
        type: z.string(),
      }),
    )
    .optional(),
  error: z.string().optional(),
})

export const ImageGenerateResponseSchema = z.object({
  prompt_id: z.string(),
})

/**
 * URL validator for the Settings drawer baseUrl field. Accepts http/https
 * with optional port + path; rejects bare hostnames (must have scheme).
 */
export const BaseUrlSchema = z
  .string()
  .trim()
  .min(1, 'Base URL is required')
  .refine(
    (val) => {
      try {
        const u = new URL(val)
        return u.protocol === 'http:' || u.protocol === 'https:'
      } catch {
        return false
      }
    },
    { message: 'Must be a valid http:// or https:// URL' },
  )

export type ValidatedHealthResponse = z.infer<typeof HealthResponseSchema>
export type ValidatedVoicesResponse = z.infer<typeof VoicesResponseSchema>
