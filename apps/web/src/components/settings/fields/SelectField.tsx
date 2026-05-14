import { useId } from 'react'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectFieldProps {
  label: string
  value: string
  onChange: (next: string) => void
  options: readonly SelectOption[]
  helperText?: string
  error?: string | null
  disabled?: boolean
}

/**
 * Native `<select>` for 5+ options or extensible/dynamic option sets.
 * For 2–4 mutually exclusive modes with visible consequences, use
 * `RadioField` instead.
 */
export function SelectField({
  label,
  value,
  onChange,
  options,
  helperText,
  error,
  disabled,
}: SelectFieldProps) {
  const id = useId()
  const helpId = useId()
  const errorId = useId()

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={
          [helperText ? helpId : null, error ? errorId : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        className={
          'w-full px-2 py-1.5 text-sm rounded bg-background border focus:outline-none focus:ring-1 ' +
          (error
            ? 'border-destructive focus:ring-destructive'
            : 'border-input focus:ring-ring')
        }
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : helperText ? (
        <p id={helpId} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      ) : null}
    </div>
  )
}
