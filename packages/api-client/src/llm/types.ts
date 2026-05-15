/**
 * LLM client types — shared shape across cloud-LLM flavors.
 *
 * Galley's `llm` slot picks one configured provider (Anthropic Claude /
 * OpenAI GPT / Google Gemini, per the plugin registry). Each adapter
 * implements `LLMClient` so the editorial chat surface doesn't care
 * which one is wired up — the slot config picks at runtime.
 *
 * Streaming is the canonical mode; non-streaming is a one-shot
 * convenience.
 */

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface LLMSendOptions {
  /** Model id to use. Falls back to the slot's configured default. */
  model?: string
  /** Hard cap on assistant output tokens. Default: 4096. */
  maxTokens?: number
  /** System prompt prepended before the conversation. */
  system?: string
  /** AbortSignal to cancel the request mid-stream. */
  signal?: AbortSignal
}

/**
 * Streaming delta yielded by `LLMClient.sendStreaming`. Adapters
 * normalize provider-specific event shapes into this minimal record.
 */
export interface LLMStreamDelta {
  /** Incremental text appended to the assistant turn. */
  textDelta?: string
  /** Set on the final event with the full response metadata. */
  final?: {
    /** Total assistant text. Adapters may rebuild this from deltas. */
    text: string
    /** Stop reason from the provider, if reported. */
    stopReason?: string
    /** Token usage, if reported. */
    usage?: { inputTokens?: number; outputTokens?: number }
  }
}

export interface LLMClient {
  /** One-shot send. Wraps the stream and concatenates. */
  send(messages: ChatMessage[], opts?: LLMSendOptions): Promise<string>
  /** Streaming send. Yields deltas as they arrive. */
  sendStreaming(
    messages: ChatMessage[],
    opts?: LLMSendOptions,
  ): AsyncGenerator<LLMStreamDelta, void, unknown>
}
