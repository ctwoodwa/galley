/**
 * Capability-slot resolution for galley clients.
 *
 * Galley apps don't talk to "the Kokoro endpoint" or "the higgs endpoint"
 * directly — they ask for a capability (`tts/fast`, `stt/quality`, `image`)
 * and the slot resolver returns the worker URL + token + flavor configured
 * for that capability.
 *
 * See galley/docs/services/README.md for the slot vocabulary and routing
 * model.
 */

export type CapabilityId =
  | 'tts/fast'
  | 'tts/quality'
  | 'stt/fast'
  | 'stt/quality'
  | 'image'
  | 'music'

/** Every capability identifier galley currently models. */
export const CAPABILITIES: readonly CapabilityId[] = [
  'tts/fast',
  'tts/quality',
  'stt/fast',
  'stt/quality',
  'image',
  'music',
] as const

export interface ServiceConfig {
  /** Worker base URL. Empty string means "use the shared fallback." */
  baseUrl: string
  /** Bearer token. Empty string when the worker doesn't require auth. */
  apiKey: string
  /** Disable the slot — UI hides actions that depend on it. */
  enabled: boolean
  /** Human-readable provider label for the Settings drawer (informational). */
  provider?: string
  /**
   * API-shape hint. Worker adapters (notably TTSClient) read this to
   * pick the right path prefix and response normalization for non-
   * canonical upstream APIs. `'standard'` or omitted = canonical galley
   * shape; `'kokoro-local'` = Kokoro-FastAPI's OpenAI-compatible shape.
   */
  flavor?: string
  /**
   * Optional shell command that launches this worker on the current
   * machine. When present, the galley desktop tray exposes Start /
   * Stop / Restart for this slot. When absent or empty, the slot is
   * probe-only (worker lives on a different host).
   *
   * Examples:
   *   "cd ~/Projects/Kokoro-FastAPI && ./start-cpu.sh"
   *   "cd C:\\tools\\higgs-audio && python -m higgs_audio.server --port 8881"
   *   "docker compose -f /opt/comfyui/docker-compose.yml up"
   *
   * The command runs through the user's default shell (`bash -lc` on
   * Mac/Linux, `cmd /c` on Windows) so PATH and shell aliases work
   * the same as if the user typed it.
   */
  localCommand?: string
}

export type ServicesConfig = Record<CapabilityId, ServiceConfig>

/** Resolved triple — what a client needs to actually make a call. */
export interface ResolvedService {
  baseUrl: string
  apiKey: string
  flavor: string
}

/**
 * The shared-default fallback. When a slot's `baseUrl` is empty, the
 * resolver returns this triple instead. Empty `baseUrl` here means
 * "the deployment has no shared fallback configured" and resolution
 * fails (the call site treats the capability as unavailable).
 */
export interface SharedDefault {
  baseUrl: string
  apiKey: string
}

/**
 * Build the default services map. All slots disabled with empty URLs.
 * Used as the initial value when no persisted state exists.
 */
export function defaultServicesConfig(): ServicesConfig {
  const empty: ServiceConfig = {
    baseUrl: '',
    apiKey: '',
    enabled: false,
    provider: '',
  }
  return {
    'tts/fast': { ...empty, flavor: 'kokoro-local' },
    'tts/quality': { ...empty, flavor: 'standard' },
    'stt/fast': { ...empty, flavor: 'standard' },
    'stt/quality': { ...empty, flavor: 'standard' },
    image: { ...empty },
    music: { ...empty },
  }
}

/**
 * Resolve a capability to a `{ baseUrl, apiKey, flavor }` triple, or `null`
 * if the capability isn't available in the current config.
 *
 * Resolution order:
 *   1. Slot disabled → null.
 *   2. Slot has non-empty baseUrl → use slot.
 *   3. Shared fallback has non-empty baseUrl → use fallback (apiKey too,
 *      flavor falls back to the slot's flavor or 'standard').
 *   4. Otherwise → null.
 */
export function getService(
  services: ServicesConfig,
  capability: CapabilityId,
  fallback?: SharedDefault,
): ResolvedService | null {
  const slot = services[capability]
  if (!slot || slot.enabled === false) {
    return null
  }
  if (slot.baseUrl) {
    return {
      baseUrl: slot.baseUrl,
      apiKey: slot.apiKey,
      flavor: slot.flavor ?? 'standard',
    }
  }
  if (fallback?.baseUrl) {
    return {
      baseUrl: fallback.baseUrl,
      apiKey: fallback.apiKey,
      flavor: slot.flavor ?? 'standard',
    }
  }
  return null
}

/**
 * Build a services map from a legacy `{ baseUrl, apiKey, ttsSource,
 * kokoroLocalUrl }` config — the shape galley used before the slot
 * model landed. Called from the Zustand `persist` migrate handler.
 *
 * Mapping logic:
 *   - tts/fast    ← kokoroLocalUrl (always assumed to be the local
 *                   Kokoro-FastAPI Docker); enabled iff ttsSource was
 *                   'kokoro-local'.
 *   - tts/quality ← baseUrl + apiKey (the remote inference server);
 *                   enabled iff ttsSource was 'remote'.
 *   - stt/fast    ← baseUrl + apiKey, enabled (assumed available on
 *                   the shared inference server).
 *   - stt/quality ← empty, disabled (no Phase 1 default).
 *   - image       ← baseUrl + apiKey, enabled.
 *   - music       ← baseUrl + apiKey, enabled.
 */
export function migrateLegacyToServices(legacy: {
  baseUrl?: string
  apiKey?: string
  ttsSource?: 'remote' | 'kokoro-local'
  kokoroLocalUrl?: string
}): ServicesConfig {
  const baseUrl = legacy.baseUrl ?? ''
  const apiKey = legacy.apiKey ?? ''
  const kokoroUrl = legacy.kokoroLocalUrl ?? ''
  const ttsSource = legacy.ttsSource ?? 'remote'

  return {
    'tts/fast': {
      baseUrl: kokoroUrl,
      apiKey: '',
      enabled: ttsSource === 'kokoro-local',
      provider: kokoroUrl ? 'kokoro-fastapi' : '',
      flavor: 'kokoro-local',
    },
    'tts/quality': {
      baseUrl,
      apiKey,
      enabled: ttsSource === 'remote',
      provider: baseUrl ? 'inference-server' : '',
      flavor: 'standard',
    },
    'stt/fast': {
      baseUrl,
      apiKey,
      enabled: Boolean(baseUrl),
      provider: baseUrl ? 'inference-server' : '',
      flavor: 'standard',
    },
    'stt/quality': {
      baseUrl: '',
      apiKey: '',
      enabled: false,
      provider: '',
      flavor: 'standard',
    },
    image: {
      baseUrl,
      apiKey,
      enabled: Boolean(baseUrl),
      provider: baseUrl ? 'inference-server' : '',
    },
    music: {
      baseUrl,
      apiKey,
      enabled: Boolean(baseUrl),
      provider: baseUrl ? 'inference-server' : '',
    },
  }
}
