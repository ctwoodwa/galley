import { useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export interface ActionFieldProps {
  label: string
  /** Description shown alongside the action. */
  description?: string
  /** Button text. Defaults to the label. */
  buttonLabel?: string
  /** Click handler — may be async. */
  onClick: () => void | Promise<void>
  /** When true, render with destructive styling. */
  destructive?: boolean
  disabled?: boolean
  /** Optional icon on the button. */
  icon?: ReactNode
  /** Latest result message; shows next to the button after the action runs. */
  resultMessage?: string | null
  resultKind?: 'success' | 'error' | 'info'
}

/**
 * Field that triggers an action — a "Test connection" button, a
 * "Force re-pair" action, etc. Buttons that perform irreversible work
 * should be paired with a confirmation dialog (not provided by this
 * field; the action handler is responsible for confirmation).
 */
export function ActionField({
  label,
  description,
  buttonLabel,
  onClick,
  destructive,
  disabled,
  icon,
  resultMessage,
  resultKind = 'info',
}: ActionFieldProps) {
  const [running, setRunning] = useState(false)

  const handle = async () => {
    setRunning(true)
    try {
      await onClick()
    } finally {
      setRunning(false)
    }
  }

  const resultColor =
    resultKind === 'success'
      ? 'text-green-600 dark:text-green-400'
      : resultKind === 'error'
        ? 'text-destructive'
        : 'text-muted-foreground'

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description ? (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        ) : null}
        {resultMessage ? (
          <p className={`text-xs mt-1 ${resultColor}`} role="status">
            {resultMessage}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={handle}
        disabled={disabled || running}
        className={
          'flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border transition-colors ' +
          (destructive
            ? 'border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground'
            : 'border-input bg-background hover:bg-muted')
        }
      >
        {running ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        ) : icon ? (
          <span aria-hidden="true">{icon}</span>
        ) : null}
        <span>{buttonLabel ?? label}</span>
      </button>
    </div>
  )
}
