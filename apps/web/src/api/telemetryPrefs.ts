import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Chapter-telemetry panel preferences.
 *
 * `enabled` — feature flag (persisted, settings toggle).
 * `visible` — current panel state (per-session, ⌘M toggles).
 *
 * Mirror of `useChatPrefs` so the two surfaces follow the same model:
 * one explicit settings toggle to turn the feature off entirely, plus
 * a keybind for in-the-moment visibility.
 */

interface TelemetryPrefsState {
  enabled: boolean
  visible: boolean
  setEnabled: (v: boolean) => void
  togglePanel: () => void
  setVisible: (v: boolean) => void
}

export const useTelemetryPrefs = create<TelemetryPrefsState>()(
  persist(
    (set, get) => ({
      enabled: true,
      visible: false,
      setEnabled: (enabled) => {
        set({ enabled, visible: enabled ? get().visible : false })
      },
      togglePanel: () => {
        const { enabled, visible } = get()
        if (!enabled) return
        set({ visible: !visible })
      },
      setVisible: (visible) => {
        if (!get().enabled) return
        set({ visible })
      },
    }),
    {
      name: 'galley.telemetry-prefs',
      version: 1,
      partialize: (state) => ({ enabled: state.enabled }),
    },
  ),
)
