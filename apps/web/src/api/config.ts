import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  type CapabilityId,
  type ServiceConfig,
  type ServicesConfig,
  type ResolvedService,
  getService,
  migrateLegacyToServices,
} from '@galley/api-client'

const DEFAULT_BASE_URL =
  (import.meta.env.VITE_GALLEY_API_BASE_URL as string | undefined) ??
  'http://desktop-umt08rn:8881'

const DEFAULT_API_KEY = (import.meta.env.VITE_GALLEY_API_KEY as string | undefined) ?? ''

const DEFAULT_KOKORO_LOCAL_URL =
  (import.meta.env.VITE_GALLEY_KOKORO_LOCAL_URL as string | undefined) ??
  'http://localhost:8880'

/**
 * Legacy active-TTS-surface flag. Kept in the state shape through the
 * v2→v3 persist migration; new code reads from `services["tts/fast"]`
 * vs `services["tts/quality"]` instead.
 */
export type TtsSource = 'remote' | 'kokoro-local'

interface ApiConfigState {
  /**
   * Shared-default base URL — the fallback every slot uses when its own
   * `baseUrl` is empty. Single-machine deployments (workers on the same
   * host) set only this and leave the slot map's per-slot URLs empty.
   */
  baseUrl: string
  apiKey: string
  /** @deprecated — left in place for v2 persisted-state compatibility.
   *  New code reads from `services["tts/fast"|"tts/quality"]`. */
  ttsSource: TtsSource
  /** @deprecated — see `services["tts/fast"].baseUrl`. */
  kokoroLocalUrl: string

  /**
   * Per-capability slot map. Each slot resolves to a worker URL via
   * `getService(services, capability, { baseUrl, apiKey })`. See
   * `docs/services/README.md` for the slot vocabulary.
   */
  services: ServicesConfig

  setBaseUrl: (url: string) => void
  setApiKey: (key: string) => void
  setTtsSource: (source: TtsSource) => void
  setKokoroLocalUrl: (url: string) => void
  setService: (capability: CapabilityId, config: Partial<ServiceConfig>) => void
  resetServices: () => void
  reset: () => void
}

function initialServices(): ServicesConfig {
  return migrateLegacyToServices({
    baseUrl: DEFAULT_BASE_URL,
    apiKey: DEFAULT_API_KEY,
    ttsSource: 'remote',
    kokoroLocalUrl: DEFAULT_KOKORO_LOCAL_URL,
  })
}

/**
 * Persistent store for the inference API config. Backed by localStorage;
 * survives reloads. Settings drawer edits these.
 *
 * Defaults are sourced from env vars (set in apps/web/.env.local — gitignored):
 *   VITE_GALLEY_API_BASE_URL=http://desktop-umt08rn:8881
 *   VITE_GALLEY_API_KEY=...
 *   VITE_GALLEY_KOKORO_LOCAL_URL=http://localhost:8880
 * Override at runtime via the settings drawer.
 *
 * Persist version 3 — v2 stored a flat `{baseUrl, apiKey, ttsSource,
 * kokoroLocalUrl}`; v3 adds the `services` slot map populated by the
 * migrate handler below.
 */
export const useApiConfig = create<ApiConfigState>()(
  persist(
    (set, get) => ({
      baseUrl: DEFAULT_BASE_URL,
      apiKey: DEFAULT_API_KEY,
      ttsSource: 'remote' as TtsSource,
      kokoroLocalUrl: DEFAULT_KOKORO_LOCAL_URL,
      services: initialServices(),
      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setApiKey: (apiKey) => set({ apiKey }),
      setTtsSource: (ttsSource) => set({ ttsSource }),
      setKokoroLocalUrl: (kokoroLocalUrl) => set({ kokoroLocalUrl }),
      setService: (capability, config) => {
        const current = get().services
        set({
          services: {
            ...current,
            [capability]: { ...current[capability], ...config },
          },
        })
      },
      resetServices: () => set({ services: initialServices() }),
      reset: () =>
        set({
          baseUrl: DEFAULT_BASE_URL,
          apiKey: DEFAULT_API_KEY,
          ttsSource: 'remote',
          kokoroLocalUrl: DEFAULT_KOKORO_LOCAL_URL,
          services: initialServices(),
        }),
    }),
    {
      name: 'galley.api-config',
      version: 4,
      migrate: (persistedState: unknown, version: number): ApiConfigState => {
        const state = (persistedState ?? {}) as Partial<ApiConfigState>
        let services = state.services
        if (version < 3) {
          // v2 → v3: build the services map from the legacy flat fields.
          services = migrateLegacyToServices({
            baseUrl: state.baseUrl,
            apiKey: state.apiKey,
            ttsSource: state.ttsSource,
            kokoroLocalUrl: state.kokoroLocalUrl,
          })
        }
        if (version < 4 && services) {
          // v3 → v4: ServiceConfig gained an optional `localCommand`.
          // Older snapshots just lack the field — fill with empty
          // strings so the UI's TextField stays controlled. The slot
          // remains probe-only until the user sets a command.
          services = Object.fromEntries(
            Object.entries(services).map(([k, cfg]) => [
              k,
              { ...cfg, localCommand: cfg.localCommand ?? '' },
            ]),
          ) as typeof services
        }
        return {
          ...state,
          baseUrl: state.baseUrl ?? DEFAULT_BASE_URL,
          apiKey: state.apiKey ?? DEFAULT_API_KEY,
          ttsSource: state.ttsSource ?? 'remote',
          kokoroLocalUrl: state.kokoroLocalUrl ?? DEFAULT_KOKORO_LOCAL_URL,
          services: services ?? initialServices(),
        } as ApiConfigState
      },
    },
  ),
)

/**
 * Resolve a capability slot to a worker URL + token + flavor, using the
 * store's slot map with the shared-default fallback. Returns `null` if
 * the slot is disabled or no URL is configured anywhere.
 *
 * Use from React components via the selector pattern:
 *   const resolved = useApiConfig((s) => resolveService(s, 'tts/fast'))
 */
export function resolveService(
  state: ApiConfigState,
  capability: CapabilityId,
): ResolvedService | null {
  return getService(state.services, capability, {
    baseUrl: state.baseUrl,
    apiKey: state.apiKey,
  })
}
