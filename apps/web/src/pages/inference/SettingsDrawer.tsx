import { useApiConfig } from '@/api/config'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { useEffect } from 'react'

interface SettingsDrawerProps {
  open: boolean
  onClose: () => void
}

/**
 * Right-side drawer that edits the Windows inference API config (baseUrl +
 * apiKey). Persists via the useApiConfig Zustand store.
 */
export function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const { baseUrl, apiKey, setBaseUrl, setApiKey, reset } = useApiConfig()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="fixed top-0 right-0 h-screen w-96 bg-surface border-l border-sidebar-border z-50 flex flex-col"
      >
        <header className="flex items-center justify-between border-b border-sidebar-border px-5 py-3 flex-shrink-0">
          <h2 id="settings-title" className="text-sm font-semibold tracking-wider uppercase text-text-dim">
            Inference API Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-text-muted hover:text-text hover:bg-bg transition-colors"
            aria-label="Close settings"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-text-dim">Base URL</span>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://desktop-umt08rn:8881"
              className="bg-bg border border-sidebar-border rounded px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent"
            />
            <span className="text-xs text-text-muted">
              Windows inference server. Default: http://desktop-umt08rn:8881
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-text-dim">API key (Bearer token)</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="(optional)"
              className="bg-bg border border-sidebar-border rounded px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent"
            />
            <span className="text-xs text-text-muted">
              Sent as <code className="text-text-dim">Authorization: Bearer …</code> on protected endpoints.
            </span>
          </label>
          <div className="pt-3 border-t border-sidebar-border">
            <Button variant="secondary" size="sm" onClick={reset}>
              Reset to defaults
            </Button>
          </div>
        </div>
      </aside>
    </>
  )
}
