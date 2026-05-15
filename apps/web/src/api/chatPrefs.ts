import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Editorial-chat preferences.
 *
 * Two layers:
 *
 *   `enabled` — feature toggle. Set in /settings/editorial. When off,
 *               the keybind does nothing and chat affordances are
 *               hidden everywhere in the UI. Default: true.
 *
 *   `visible` — current panel visibility. Toggled by ⌘K / Ctrl+K and
 *               by the panel's close button. NOT persisted — every
 *               new session starts with the panel hidden so the
 *               reader is the default focus.
 */

interface ChatPrefsState {
  /** Persisted: is the editorial chat feature enabled at all? */
  enabled: boolean
  /** Non-persisted: is the panel visible right now? */
  visible: boolean
  setEnabled: (v: boolean) => void
  togglePanel: () => void
  setVisible: (v: boolean) => void
}

export const useChatPrefs = create<ChatPrefsState>()(
  persist(
    (set, get) => ({
      enabled: true,
      visible: false,
      setEnabled: (enabled) => {
        // Disabling the feature also hides the panel immediately.
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
      name: 'galley.chat-prefs',
      version: 1,
      // Only persist the feature flag; visibility is per-session.
      partialize: (state) => ({ enabled: state.enabled }),
    },
  ),
)
