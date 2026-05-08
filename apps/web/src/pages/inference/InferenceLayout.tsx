import { Outlet, NavLink } from 'react-router-dom'
import { useHealth } from '@/api/useHealth'
import { useApiConfig } from '@/api/config'
import { Settings as SettingsIcon } from 'lucide-react'
import { useState } from 'react'
import { SettingsDrawer } from './SettingsDrawer'

const ROUTES = [
  { path: '/inference/voices', label: 'Voices (TTS)' },
  { path: '/inference/stt', label: 'STT' },
  { path: '/inference/image', label: 'Image' },
  { path: '/inference/music', label: 'Music' },
]

const STATUS_COLOR: Record<string, string> = {
  ok: 'bg-ok',
  warming: 'bg-warn',
  error: 'bg-danger',
  loading: 'bg-text-muted',
}

const STATUS_LABEL: Record<string, string> = {
  ok: 'Ready',
  warming: 'Warming up',
  error: 'Unreachable',
  loading: 'Checking…',
}

/**
 * Top-level layout for the inference studio surface (raw API exploration).
 * Provides subnav + a global health indicator + settings drawer (baseUrl + apiKey).
 *
 * Distinct from /read/:bookId/studio/* which is the chapter-aware editorial
 * studio (galley's existing surface). Same backend, different UX intent.
 */
export default function InferenceLayout() {
  const { status } = useHealth()
  const baseUrl = useApiConfig((s) => s.baseUrl)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="flex flex-col h-screen bg-bg text-text">
      <header className="flex items-center justify-between border-b border-sidebar-border px-5 py-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold tracking-wider uppercase text-text-dim">
            Inference Studio
          </h1>
          <nav className="flex gap-1">
            {ROUTES.map((r) => (
              <NavLink
                key={r.path}
                to={r.path}
                className={({ isActive }) =>
                  `px-3 py-1 text-sm rounded transition-colors ${
                    isActive
                      ? 'bg-surface text-text'
                      : 'text-text-dim hover:text-text hover:bg-surface'
                  }`
                }
              >
                {r.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1.5 text-xs text-text-dim"
            title={`Health: ${STATUS_LABEL[status]} · ${baseUrl}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${STATUS_COLOR[status] ?? 'bg-text-muted'}`}
            />
            <span>{STATUS_LABEL[status]}</span>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded text-text-dim hover:text-text hover:bg-surface transition-colors"
            aria-label="Open settings"
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
