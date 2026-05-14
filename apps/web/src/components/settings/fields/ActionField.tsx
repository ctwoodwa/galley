import { useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export interface ActionFieldProps {
  label: string
  description?: string
  buttonLabel?: string
  onClick: () => void | Promise<void>
  destructive?: boolean
  disabled?: boolean
  icon?: ReactNode
  resultMessage?: string | null
  resultKind?: 'success' | 'error' | 'info'
  /** Visual emphasis — `default` uses ink-soft border; `vermilion` uses the accent. */
  emphasis?: 'default' | 'vermilion'
}

/**
 * Field that triggers an action — a "Test" button, a destructive
 * reset, etc. Button is a typographic hairline rectangle; hover fills.
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
  emphasis = 'default',
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

  const cls =
    'gs-button' +
    (destructive ? ' destructive' : emphasis === 'vermilion' ? ' vermilion' : '')

  return (
    <div className="gs-action">
      <div className="gs-action-text">
        <p className="gs-action-label">{label}</p>
        {description ? <p className="gs-action-description">{description}</p> : null}
        {resultMessage ? (
          <span className={`gs-action-result ${resultKind}`} role="status">
            {resultMessage}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={handle}
        disabled={disabled || running}
        className={cls}
      >
        {running ? (
          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
        ) : icon ? (
          <span aria-hidden="true">{icon}</span>
        ) : null}
        <span>{buttonLabel ?? label}</span>
      </button>
    </div>
  )
}
