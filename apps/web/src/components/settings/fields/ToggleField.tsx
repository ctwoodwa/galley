import { useId } from 'react'

export interface ToggleFieldProps {
  label: string
  value: boolean
  onChange: (next: boolean) => void
  helperText?: string
  disabled?: boolean
}

/**
 * Toggle for immediate on/off state with no consequences beyond the
 * flag itself. Per `docs/settings/ia.md` the "consequence test":
 * if flipping changes behavior in multiple ways, use a `RadioField`
 * instead.
 */
export function ToggleField({
  label,
  value,
  onChange,
  helperText,
  disabled,
}: ToggleFieldProps) {
  const id = useId()
  const helpId = useId()

  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-labelledby={`${id}-label`}
        aria-describedby={helperText ? helpId : undefined}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={
          'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-ring ' +
          (value ? 'bg-primary' : 'bg-muted')
        }
      >
        <span
          aria-hidden="true"
          className={
            'inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform ' +
            (value ? 'translate-x-5' : 'translate-x-1')
          }
        />
      </button>
      <div className="flex-1 min-w-0">
        <label id={`${id}-label`} className="block text-sm font-medium cursor-pointer" onClick={() => !disabled && onChange(!value)}>
          {label}
        </label>
        {helperText ? (
          <p id={helpId} className="text-xs text-muted-foreground mt-0.5">
            {helperText}
          </p>
        ) : null}
      </div>
    </div>
  )
}
