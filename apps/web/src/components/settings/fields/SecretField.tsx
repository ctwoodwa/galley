import { useId, useState } from 'react'
import { Eye, EyeOff, Copy, Check } from 'lucide-react'

export interface SecretFieldProps {
  label: string
  value: string
  onChange: (next: string) => void
  helperText?: string
  error?: string | null
  placeholder?: string
  disabled?: boolean
}

export function SecretField({
  label,
  value,
  onChange,
  helperText,
  error,
  placeholder,
  disabled,
}: SecretFieldProps) {
  const id = useId()
  const helpId = useId()
  const errorId = useId()
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // clipboard permission denied; user can manually reveal + copy
    }
  }

  return (
    <div className="gs-field">
      <label htmlFor={id} className="gs-field-label">
        {label}
      </label>
      <div className="gs-secret-wrap">
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={
            [helperText ? helpId : null, error ? errorId : null]
              .filter(Boolean)
              .join(' ') || undefined
          }
          className={'gs-input-secret' + (error ? ' error' : '')}
        />
        <div className="gs-secret-controls">
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copy to clipboard"
            disabled={!value || disabled}
            className="gs-icon-btn"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? 'Hide' : 'Reveal'}
            disabled={disabled}
            className="gs-icon-btn"
          >
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </div>
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
