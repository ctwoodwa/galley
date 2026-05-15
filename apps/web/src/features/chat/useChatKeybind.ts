import { useEffect } from 'react'

import { useChatPrefs } from '@/api/chatPrefs'

/**
 * Wires the global ⌘K / Ctrl+K keybind to toggle the chat panel.
 * Mounted once near the app root (or inside the reader); attaches to
 * `document` so it works regardless of which element has focus.
 *
 * `Escape` closes the panel when it's visible — convenient for
 * dismissing without taking hands off the keyboard. Doesn't fire when
 * the panel isn't open (so it can't steal Escape from other UI like
 * dialogs).
 */
export function useChatKeybind(): void {
  const togglePanel = useChatPrefs((s) => s.togglePanel)
  const setVisible = useChatPrefs((s) => s.setVisible)
  const visible = useChatPrefs((s) => s.visible)
  const enabled = useChatPrefs((s) => s.enabled)

  useEffect(() => {
    if (!enabled) return undefined
    const onKey = (e: KeyboardEvent) => {
      const isToggle = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      if (isToggle) {
        e.preventDefault()
        togglePanel()
        return
      }
      if (visible && e.key === 'Escape') {
        // Only hijack Escape when the chat input is focused — otherwise
        // let other UI (dialogs, dropdowns) handle it.
        const active = document.activeElement as HTMLElement | null
        if (active?.closest('[data-chat-panel]')) {
          e.preventDefault()
          setVisible(false)
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [togglePanel, setVisible, visible, enabled])
}
