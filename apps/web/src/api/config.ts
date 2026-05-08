import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const DEFAULT_BASE_URL =
  (import.meta.env.VITE_GALLEY_API_BASE_URL as string | undefined) ??
  'http://desktop-umt08rn:8881'

const DEFAULT_API_KEY = (import.meta.env.VITE_GALLEY_API_KEY as string | undefined) ?? ''

interface ApiConfigState {
  baseUrl: string
  apiKey: string
  setBaseUrl: (url: string) => void
  setApiKey: (key: string) => void
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
      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setApiKey: (apiKey) => set({ apiKey }),
      reset: () => set({ baseUrl: DEFAULT_BASE_URL, apiKey: DEFAULT_API_KEY }),
    }),
    {
      name: 'galley.api-config',
      version: 1,
    },
  ),
)
