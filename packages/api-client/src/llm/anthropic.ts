/**
 * Anthropic Claude adapter.
 *
 * POST `<baseUrl>/v1/messages` with `stream: true`; consumes the SSE
 * event stream and yields `LLMStreamDelta` records.
 *
 * Browser caveats:
 *   - Anthropic permits direct-from-browser calls when the
 *     `anthropic-dangerous-direct-browser-access: true` header is set.
 *     This is the supported path for desktop apps like galley where
 *     the user owns the API key.
 *   - For multi-tenant deployments where the key is server-held, use
 *     a server-side proxy and a different adapter; that pattern is
 *     out of scope for v1.
 */

import type {
  ChatMessage,
  LLMClient,
  LLMSendOptions,
  LLMStreamDelta,
} from './types'

export interface AnthropicConfig {
  baseUrl: string
  apiKey: string
  /** Default model used when a per-call `model` isn't supplied. */
  defaultModel?: string
  /** Anthropic API version pin. Galley targets 2023-06-01. */
  apiVersion?: string
}

const DEFAULT_MODEL = 'claude-opus-4-7'
const DEFAULT_API_VERSION = '2023-06-01'

export function createAnthropicClient(cfg: AnthropicConfig): LLMClient {
  return {
    async send(messages, opts) {
      let text = ''
      for await (const d of this.sendStreaming(messages, opts)) {
        if (d.textDelta) text += d.textDelta
        if (d.final) return d.final.text
      }
      return text
    },

    sendStreaming: async function* (messages, opts) {
      const url = `${cfg.baseUrl.replace(/\/$/, '')}/v1/messages`
      const { systemMsg, restMsgs } = splitSystem(messages, opts?.system)

      const body = {
        model: opts?.model ?? cfg.defaultModel ?? DEFAULT_MODEL,
        max_tokens: opts?.maxTokens ?? 4096,
        stream: true,
        ...(systemMsg ? { system: systemMsg } : {}),
        messages: restMsgs.map(m => ({ role: m.role, content: m.content })),
      }

      const res = await fetch(url, {
        method: 'POST',
        signal: opts?.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': cfg.apiVersion ?? DEFAULT_API_VERSION,
          // Required when calling from a browser. No-op on Node.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new LLMError(
          `Anthropic ${res.status} ${res.statusText}: ${errText.slice(0, 400)}`,
          res.status,
        )
      }
      if (!res.body) {
        throw new LLMError('Anthropic returned empty body', 0)
      }

      let collected = ''
      let stopReason: string | undefined
      let usage: { inputTokens?: number; outputTokens?: number } | undefined

      for await (const event of parseSseEvents(res.body)) {
        switch (event.type) {
          case 'content_block_delta': {
            const delta = event.delta as { type?: string; text?: string }
            if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
              collected += delta.text
              yield { textDelta: delta.text }
            }
            break
          }
          case 'message_delta': {
            const md = event as { delta?: { stop_reason?: string }; usage?: { input_tokens?: number; output_tokens?: number } }
            if (md.delta?.stop_reason) stopReason = md.delta.stop_reason
            if (md.usage) {
              usage = {
                inputTokens: md.usage.input_tokens,
                outputTokens: md.usage.output_tokens,
              }
            }
            break
          }
          case 'message_stop':
            yield { final: { text: collected, stopReason, usage } }
            return
        }
      }
      // Stream ended without a `message_stop` — surface what we have.
      yield { final: { text: collected, stopReason, usage } }
    },
  }
}

/** Pull out the system message — Anthropic puts it in a dedicated
 *  top-level field, not in the messages array. */
function splitSystem(
  messages: ChatMessage[],
  optSystem?: string,
): { systemMsg?: string; restMsgs: ChatMessage[] } {
  const sysFromMessages = messages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n')
    .trim()
  const combinedSys = [optSystem, sysFromMessages].filter(Boolean).join('\n\n').trim()
  return {
    systemMsg: combinedSys || undefined,
    restMsgs: messages.filter(m => m.role !== 'system'),
  }
}

export class LLMError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'LLMError'
    this.status = status
  }
}

/**
 * Minimal SSE parser over a `ReadableStream`. Yields objects parsed
 * from `data:` lines. Anthropic interleaves multiple event types per
 * stream, all prefixed by `event:` + `data: {...}`. We don't need the
 * `event:` line — every record carries `type` in its JSON.
 */
async function* parseSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE events are separated by blank lines.
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const payload = parseSseFrame(raw)
        if (payload) yield payload
      }
    }
  } finally {
    try { reader.releaseLock() } catch { /* ignore */ }
  }
}

function parseSseFrame(frame: string): Record<string, unknown> | null {
  // Concatenate any `data:` lines (a single event can split across them).
  let data = ''
  for (const line of frame.split('\n')) {
    if (line.startsWith('data:')) {
      data += line.slice(5).trimStart()
    }
  }
  if (!data) return null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}
