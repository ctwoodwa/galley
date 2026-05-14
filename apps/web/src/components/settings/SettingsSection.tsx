import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { scopeDescription, scopeLabel, type SettingsScope } from './policy'

export type SaveState = 'saved' | 'saving' | 'unsaved-error'

export interface SettingsSectionProps {
  title: string
  description?: string
  scope: SettingsScope
  /** Roman numeral or label for the section's numbered placement. */
  numeral?: string
  saveState?: SaveState
  /** Section-level error message rendered above the field list. */
  error?: string | null
  children: ReactNode
}

/**
 * Editorial section: a roman-numeral plate on the left, display-serif
 * title, italic description, small-caps scope tag, and a pilcrow-marked
 * save-state badge in the upper right. Inline save per section — no
 * global save button.
 */
export function SettingsSection({
  title,
  description,
  scope,
  numeral,
  saveState = 'saved',
  error,
  children,
}: SettingsSectionProps) {
  return (
    <section className="gs-section">
      <header className="gs-section-header">
        <div className="gs-section-numeral" aria-hidden="true">
          {numeral ?? '§'}
        </div>
        <div className="gs-section-headings">
          <h1 className="gs-section-title">{title}</h1>
          {description ? (
            <p className="gs-section-description">{description}</p>
          ) : null}
          <p className="gs-section-scope" title={scopeDescription(scope)}>
            {scopeLabel(scope)}
          </p>
        </div>
        <SaveStateBadge state={saveState} />
      </header>
      {error ? (
        <div role="alert" className="gs-section-error">
          {error}
        </div>
      ) : null}
      <div className="gs-section-body">{children}</div>
    </section>
  )
}

function SaveStateBadge({ state }: { state: SaveState }) {
  if (state === 'saving') {
    return (
      <span className="gs-save-state saving">
        <Loader2 size={11} className="animate-spin" aria-hidden="true" />
        saving
      </span>
    )
  }
  if (state === 'unsaved-error') {
    return (
      <span className="gs-save-state error">
        <span className="gs-save-state-pilcrow" aria-hidden="true">!</span>
        validation error
      </span>
    )
  }
  return (
    <span className="gs-save-state">
      <span className="gs-save-state-pilcrow" aria-hidden="true">¶</span>
      saved
    </span>
  )
}
