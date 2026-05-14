import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { isVisible, scopeLabel, type SettingsScope } from './policy'
import './settings.css'

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

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

/**
 * Editorial Letterpress settings chrome. Left nav reads as a table of
 * contents (roman numerals, italic marginalia for scope); detail pane
 * is the active section. Search filters by section label/description.
 *
 * Themed via `settings.css` scoped to `.galley-settings` — does not
 * affect the rest of the app.
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
    <div className="galley-settings">
      <div className="gs-shell">
        <nav aria-label="Settings sections" className="gs-nav">
          <div className="gs-wordmark">
            Galley
            <span className="gs-wordmark-sub">an editorial production platform</span>
          </div>
          <div className="gs-search">
            <label className="gs-search-wrap">
              <Search className="gs-search-icon" size={13} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search settings…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="gs-search-input"
                aria-label="Search settings"
              />
            </label>
          </div>
          <ul className="gs-nav-list">
            {filtered.map((s, i) => {
              const original = visible.findIndex((v) => v.id === s.id)
              const numeral = ROMAN[original] ?? String(original + 1)
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(s.id)}
                    aria-current={s.id === active?.id ? 'page' : undefined}
                    className="gs-nav-item"
                  >
                    <span className="gs-nav-numeral">{numeral}</span>
                    <span>
                      <span className="gs-nav-label">{s.label}</span>
                      <span className="gs-nav-scope">{scopeLabel(s.scope)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
            {filtered.length === 0 ? (
              <li className="gs-nav-empty">No sections match "{query}".</li>
            ) : null}
          </ul>
        </nav>
        <main className="gs-main">
          {ActiveComponent ? (
            <ActiveComponent />
          ) : (
            <div className="gs-section">
              <p className="gs-placeholder">No settings section available.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
