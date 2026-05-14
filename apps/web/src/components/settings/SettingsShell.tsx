import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { isVisible, type SettingsScope } from './policy'

/**
 * One registered section. The shell renders the section's component
 * when active; the rest is metadata for the nav.
 */
export interface SettingsSectionDef {
  id: string
  label: string
  description?: string
  icon?: ReactNode
  scope: SettingsScope
  Component: ComponentType
}

export interface SettingsShellProps {
  sections: SettingsSectionDef[]
  initialSectionId?: string
}

/**
 * Settings chrome: left nav with search, detail pane on the right.
 * Filters sections by both `isVisible()` policy and the current
 * search query. The active section's component is mounted in the
 * detail pane; switching sections unmounts the previous one (no
 * client-side state survives — sections own their save state via
 * Zustand stores).
 */
export function SettingsShell({ sections, initialSectionId }: SettingsShellProps) {
  const visible = useMemo(
    () => sections.filter((s) => isVisible(s.scope)),
    [sections],
  )
  const [activeId, setActiveId] = useState<string>(
    initialSectionId ?? visible[0]?.id ?? '',
  )
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return visible
    return visible.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q),
    )
  }, [visible, query])

  const active = visible.find((s) => s.id === activeId) ?? visible[0]
  const ActiveComponent = active?.Component

  return (
    <div className="flex h-full w-full bg-surface text-foreground">
      <nav
        aria-label="Settings sections"
        className="w-64 flex-shrink-0 border-r border-sidebar-border flex flex-col"
      >
        <div className="p-3 border-b border-sidebar-border">
          <label className="relative block">
            <Search
              className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Search settings"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded bg-background border border-input focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Search settings"
            />
          </label>
        </div>
        <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filtered.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setActiveId(s.id)}
                aria-current={s.id === active?.id ? 'page' : undefined}
                className={
                  'w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 ' +
                  (s.id === active?.id
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted text-foreground')
                }
              >
                {s.icon ? <span aria-hidden="true">{s.icon}</span> : null}
                <span>{s.label}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="px-2 py-2 text-xs text-muted-foreground">
              No sections match "{query}".
            </li>
          ) : null}
        </ul>
      </nav>
      <main className="flex-1 overflow-y-auto">
        {ActiveComponent ? (
          <ActiveComponent />
        ) : (
          <div className="p-8 text-muted-foreground">
            No settings section available.
          </div>
        )}
      </main>
    </div>
  )
}
