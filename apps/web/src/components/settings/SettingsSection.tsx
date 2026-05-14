import type { ReactNode } from 'react'
import { Loader2, Check, AlertCircle } from 'lucide-react'
import { scopeDescription, scopeLabel, type SettingsScope } from './policy'

export type SaveState = 'saved' | 'saving' | 'unsaved-error'

export interface SettingsSectionProps {
  title: string
  description?: string
  scope: SettingsScope
  saveState?: SaveState
  /** Section-level error message rendered above the field list. */
  error?: string | null
  children: ReactNode
}

/**
 * One task-based settings section. Owns its title, scope label,
 * save-state indicator, and section-level error display. Fields go
 * inside as children; this component does not assume a specific
 * layout for the field list (the section authors arrange their fields
 * however suits the content).
 *
 * Per `docs/settings/ia.md`: save is inline + per-section, no global
 * save button. The `saveState` prop reflects the state the section
 * itself manages; the indicator only shows "saving" briefly while a
 * write is in flight.
 */
export function SettingsSection({
  title,
  description,
  scope,
  saveState = 'saved',
  error,
  children,
}: SettingsSectionProps) {
  return (
    <section className="max-w-3xl mx-auto px-8 py-6 space-y-6">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">{title}</h1>
          <SaveStateBadge state={saveState} />
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
        <p
          className="text-xs text-muted-foreground"
          title={scopeDescription(scope)}
        >
          Scope: {scopeLabel(scope)}
        </p>
      </header>
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="w-4 h-4 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function SaveStateBadge({ state }: { state: SaveState }) {
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        Saving…
      </span>
    )
  }
  if (state === 'unsaved-error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="w-3 h-3" aria-hidden="true" />
        Validation error
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
      <Check className="w-3 h-3" aria-hidden="true" />
      Saved
    </span>
  )
}
