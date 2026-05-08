import { describe, expect, it } from 'vitest'
import {
  HealthResponseSchema,
  VoicesResponseSchema,
  BaseUrlSchema,
  ImageStatusSchema,
} from '../schemas'

describe('HealthResponseSchema', () => {
  it('parses a valid response', () => {
    expect(() =>
      HealthResponseSchema.parse({
        status: 'ok',
        model_loaded: true,
        queue_depth: 0,
        vram_used_gb: 3.32,
      }),
    ).not.toThrow()
  })

  it('rejects missing fields', () => {
    expect(() =>
      HealthResponseSchema.parse({ status: 'ok' }),
    ).toThrow()
  })

  it('rejects unknown status values', () => {
    expect(() =>
      HealthResponseSchema.parse({
        status: 'broken',
        model_loaded: true,
        queue_depth: 0,
        vram_used_gb: 0,
      }),
    ).toThrow()
  })
})

describe('VoicesResponseSchema', () => {
  it('parses an empty list', () => {
    expect(VoicesResponseSchema.parse({ voices: [] })).toEqual({ voices: [] })
  })

  it('parses a populated list', () => {
    const data = {
      voices: [
        { id: 'af_heart', transcript: '', sample_rate: 24000, is_stock: true },
      ],
    }
    expect(VoicesResponseSchema.parse(data)).toEqual(data)
  })

  it('rejects malformed entries', () => {
    expect(() =>
      VoicesResponseSchema.parse({
        voices: [{ id: 'bad', transcript: '', sample_rate: 'not-a-number', is_stock: true }],
      }),
    ).toThrow()
  })
})

describe('BaseUrlSchema', () => {
  it.each([
    ['http://localhost:8881', true],
    ['https://desktop-umt08rn:8881', true],
    ['http://desktop-umt08rn:8881/api', true],
  ])('accepts %s', (url, ok) => {
    const result = BaseUrlSchema.safeParse(url)
    expect(result.success).toBe(ok)
  })

  it.each([
    ['', 'empty'],
    ['  ', 'whitespace only'],
    ['desktop-umt08rn:8881', 'no scheme'],
    ['ftp://desktop-umt08rn', 'wrong scheme'],
    ['not a url', 'malformed'],
  ])('rejects %s (%s)', (url) => {
    expect(BaseUrlSchema.safeParse(url).success).toBe(false)
  })
})

describe('ImageStatusSchema', () => {
  it('parses pending without images', () => {
    expect(() => ImageStatusSchema.parse({ status: 'pending' })).not.toThrow()
  })

  it('parses done with images array', () => {
    expect(() =>
      ImageStatusSchema.parse({
        status: 'done',
        images: [{ filename: 'r.png', subfolder: '', type: 'output' }],
      }),
    ).not.toThrow()
  })

  it('parses error with message', () => {
    expect(() =>
      ImageStatusSchema.parse({ status: 'error', error: 'OOM' }),
    ).not.toThrow()
  })
})
