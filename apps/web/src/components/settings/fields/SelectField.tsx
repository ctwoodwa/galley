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
    <div className="gs-field">
      <label htmlFor={id} className="gs-field-label">
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
        className={'gs-select' + (error ? ' error' : '')}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} role="alert" className="gs-field-error">
          {error}
        </p>
      ) : helperText ? (
        <p id={helpId} className="gs-field-helper">
          {helperText}
        </p>
      ) : null}
    </div>
  )
}
