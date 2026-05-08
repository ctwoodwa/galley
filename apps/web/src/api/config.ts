import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const DEFAULT_BASE_URL =
  (import.meta.env.VITE_GALLEY_API_BASE_URL as string | undefined) ??
  'http://desktop-umt08rn:8881'

const DEFAULT_API_KEY = (import.meta.env.VITE_GALLEY_API_KEY as string | undefined) ?? ''

const DEFAULT_KOKORO_LOCAL_URL =
  (import.meta.env.VITE_GALLEY_KOKORO_LOCAL_URL as string | undefined) ??
  'http://localhost:8880'

export type TtsSource = 'remote' | 'kokoro-local'

interface ApiConfigState {
  /** Remote GPU API (TTS / STT / Image / Music). */
  baseUrl: string
  apiKey: string
  /** Active TTS surface: 'remote' (use baseUrl) or 'kokoro-local' (local Docker). */
  ttsSource: TtsSource
  /** Local kokoro-fastapi Docker URL (used when ttsSource === 'kokoro-local'). */
  kokoroLocalUrl: string
  setBaseUrl: (url: string) => void
  setApiKey: (key: string) => void
  setTtsSource: (source: TtsSource) => void
  setKokoroLocalUrl: (url: string) => void
  reset: () => void
}

/**
 * Persistent store for the inference API config (baseUrl + Bearer apiKey).
 * Backed by localStorage; survives reloads. Settings drawer edits these.
 *
 * Defaults are sourced from env vars (set in apps/web/.env.local — gitignored):
 *   VITE_GALLEY_API_BASE_URL=http://desktop-umt08rn:8881
 *   VITE_GALLEY_API_KEY=...
 * Override at runtime via the settings drawer.
 */
export const useApiConfig = create<ApiConfigState>()(
  persist(
    (set) => ({
      baseUrl: DEFAULT_BASE_URL,
      apiKey: DEFAULT_API_KEY,
      ttsSource: 'remote' as TtsSource,
      kokoroLocalUrl: DEFAULT_KOKORO_LOCAL_URL,
      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setApiKey: (apiKey) => set({ apiKey }),
      setTtsSource: (ttsSource) => set({ ttsSource }),
      setKokoroLocalUrl: (kokoroLocalUrl) => set({ kokoroLocalUrl }),
      reset: () =>
        set({
          baseUrl: DEFAULT_BASE_URL,
          apiKey: DEFAULT_API_KEY,
          ttsSource: 'remote',
          kokoroLocalUrl: DEFAULT_KOKORO_LOCAL_URL,
        }),
    }),
    {
      name: 'galley.api-config',
      version: 2,
    },
  ),
)
