import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const DEFAULT_BASE_URL = 'http://desktop-umt08rn:8881'

interface ApiConfigState {
  baseUrl: string
  apiKey: string
  setBaseUrl: (url: string) => void
  setApiKey: (key: string) => void
  reset: () => void
}

/**
 * Persistent store for the Windows inference API config (baseUrl + Bearer apiKey).
 * Backed by localStorage; survives reloads. Settings drawer in AppLayout edits these.
 *
 * The default baseUrl points at the configured dev hostname; override per-machine
 * via the settings drawer or by setting `localStorage` keys directly.
 */
export const useApiConfig = create<ApiConfigState>()(
  persist(
    (set) => ({
      baseUrl: DEFAULT_BASE_URL,
      apiKey: '',
      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setApiKey: (apiKey) => set({ apiKey }),
      reset: () => set({ baseUrl: DEFAULT_BASE_URL, apiKey: '' }),
    }),
    {
      name: 'galley.api-config',
      version: 1,
    },
  ),
)
