/**
 * Build an `LLMClient` from the configured `llm` slot, dispatching on
 * the slot's `flavor`. The chat surface uses this to send messages
 * without knowing which provider is wired up.
 *
 * MVP supports `'anthropic'` only — OpenAI and Google Gemini adapters
 * are planned for Phase 2 and will plug into the same factory.
 */

import {
  createAnthropicClient,
  type LLMClient,
  type ServiceConfig,
} from '@galley/api-client'

export interface BuiltClient {
  client: LLMClient
  /** Resolved model id the client will send. */
  model: string
  /** Provider tag for logging / UI breadcrumbs. */
  provider: 'anthropic' | 'openai' | 'google'
}

export class LLMNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LLMNotConfiguredError'
  }
}

export function buildLLMClient(slot: ServiceConfig | undefined): BuiltClient {
  if (!slot || !slot.enabled) {
    throw new LLMNotConfiguredError(
      'The `llm` slot is not enabled. Configure it in Settings → Services.',
    )
  }
  if (!slot.baseUrl) {
    throw new LLMNotConfiguredError(
      'The `llm` slot has no base URL. Configure it in Settings → Services.',
    )
  }
  if (!slot.apiKey) {
    throw new LLMNotConfiguredError(
      'The `llm` slot has no API key. Add one in Settings → Services.',
    )
  }

  const flavor = (slot.flavor ?? '').toLowerCase()

  if (flavor === 'anthropic' || slot.baseUrl.includes('anthropic.com')) {
    return {
      provider: 'anthropic',
      model: pickModel(slot, 'claude-opus-4-7'),
      client: createAnthropicClient({
        baseUrl: slot.baseUrl,
        apiKey: slot.apiKey,
        defaultModel: pickModel(slot, 'claude-opus-4-7'),
      }),
    }
  }

  throw new LLMNotConfiguredError(
    `Unsupported llm flavor "${flavor || 'unknown'}". MVP supports 'anthropic'; OpenAI / Gemini adapters land in Phase 2.`,
  )
}

function pickModel(slot: ServiceConfig, fallback: string): string {
  // `model` isn't part of ServiceConfig today; the slot's provider
  // field doubles as a model hint until a dedicated field lands.
  // Users typing a model id into `provider` (e.g. 'claude-sonnet-4-6')
  // get that exact model; otherwise the fallback applies.
  const candidate = (slot.provider ?? '').trim()
  if (candidate && candidate.startsWith('claude-')) return candidate
  return fallback
}
