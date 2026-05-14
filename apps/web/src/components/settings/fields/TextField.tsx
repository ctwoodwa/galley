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
  /** Force the input type — defaults to `text`. */
  inputType?: 'text' | 'url' | 'email' | 'number'
  /** Show "(optional)" next to the label when required is false. */
  showOptional?: boolean
}

/**
 * Text input field. URL / email / number variants pick a different
 * `inputType`; validation is the caller's job (Zod schema on change
 * is the recommended pattern).
 */
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
  const describedBy = [
    helperText ? helpId : null,
    error ? errorId : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {!required && showOptional ? (
          <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
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
        className={
          'w-full px-2.5 py-1.5 text-sm rounded bg-background border focus:outline-none focus:ring-1 ' +
          (error
            ? 'border-destructive focus:ring-destructive'
            : 'border-input focus:ring-ring')
        }
      />
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
