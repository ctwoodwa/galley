import { useId } from 'react'

export interface TextFieldProps {
  label: string
  value: string
  onChange: (next: string) => void
  helperText?: string
  error?: string | null
  placeholder?: string
  disabled?: boolean
  required?: boolean
  inputType?: 'text' | 'url' | 'email' | 'number'
  showOptional?: boolean
}

export function TextField({
  label,
  value,
  onChange,
  helperText,
  error,
  placeholder,
  disabled,
  required,
  inputType = 'text',
  showOptional,
}: TextFieldProps) {
  const id = useId()
  const helpId = useId()
  const errorId = useId()
  const describedBy = [helperText ? helpId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="gs-field">
      <label htmlFor={id} className="gs-field-label">
        {label}
        {!required && showOptional ? (
          <span className="gs-field-optional">optional</span>
        ) : null}
      </label>
      <input
        id={id}
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        className={'gs-input' + (error ? ' error' : '')}
      />
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
