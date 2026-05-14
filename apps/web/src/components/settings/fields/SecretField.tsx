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

/**
 * Field for secret values (bearer tokens, API keys). Masked by
 * default; reveal toggle shows the value briefly; copy button
 * pushes to clipboard.
 *
 * Per `docs/settings/ia.md`, never re-display a secret once written
 * is the long-term contract — but UI affordances on a single device
 * (where the secret is already in localStorage) include reveal +
 * copy for practical use. Future hardening: secrets move to OS
 * keystore via Sunfish kernel-security.
 */
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
      // Ignore — copy-to-clipboard occasionally fails in
      // permissionless contexts; user can manually reveal + copy.
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
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
          className={
            'w-full pl-2.5 pr-20 py-1.5 text-sm rounded bg-background border focus:outline-none focus:ring-1 font-mono ' +
            (error
              ? 'border-destructive focus:ring-destructive'
              : 'border-input focus:ring-ring')
          }
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copy to clipboard"
            disabled={!value || disabled}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? 'Hide' : 'Reveal'}
            disabled={disabled}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
          >
            {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
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
