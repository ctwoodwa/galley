import { useEffect } from 'react'

import { useTelemetryPrefs } from '@/api/telemetryPrefs'

/**
 * Wires ⌘M / Ctrl+M to toggle the chapter-telemetry panel. Mirrors
 * `useChatKeybind`: only fires when the feature flag is enabled;
 * Escape closes the panel when the panel itself has focus so we
 * don't steal Esc from other UI (dialogs, dropdowns).
 */
export function useTelemetryKeybind(): void {
  const togglePanel = useTelemetryPrefs((s) => s.togglePanel)
  const setVisible = useTelemetryPrefs((s) => s.setVisible)
  const visible = useTelemetryPrefs((s) => s.visible)
  const enabled = useTelemetryPrefs((s) => s.enabled)

  useEffect(() => {
    if (!enabled) return undefined
    const onKey = (e: KeyboardEvent) => {
      const isToggle = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm'
      if (isToggle) {
        e.preventDefault()
        togglePanel()
        return
      }
      if (visible && e.key === 'Escape') {
        const active = document.activeElement as HTMLElement | null
        if (active?.closest('[data-telemetry-panel]')) {
          e.preventDefault()
          setVisible(false)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [togglePanel, setVisible, visible, enabled])
}
