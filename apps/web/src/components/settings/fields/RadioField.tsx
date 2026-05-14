import { useId } from 'react'

export interface RadioOption<TValue extends string = string> {
  value: TValue
  label: string
  /** Optional one-line consequence text shown beneath the row when this
   *  option is selected — the "what happens if I pick this" hint. */
  consequence?: string
}

export interface RadioFieldProps<TValue extends string = string> {
  label: string
  value: TValue
  onChange: (next: TValue) => void
  options: readonly RadioOption<TValue>[]
  helperText?: string
  error?: string | null
  disabled?: boolean
}

/**
 * Editorial radio: a row of small-caps options separated by hairline
 * middots, vermilion underline beneath the active one. Use for 2-4
 * mutually exclusive modes whose consequences differ (e.g., prose-review
 * preset gentle/standard/strict, voice-pass mode off/read-only/auto-apply).
 *
 * Per `docs/settings/ia.md`, the "consequence test" picks the right
 * field type — toggles are for on/off with no other consequence; radios
 * are for visible-trade-off choices.
 */
export function RadioField<TValue extends string = string>({
  label,
  value,
  onChange,
  options,
  helperText,
  error,
  disabled,
}: RadioFieldProps<TValue>) {
  const groupId = useId()
  const helpId = useId()
  const errorId = useId()
  const active = options.find((o) => o.value === value)

  return (
    <div className="gs-field" role="radiogroup" aria-labelledby={`${groupId}-label`}>
      <span id={`${groupId}-label`} className="gs-field-label">
        {label}
      </span>
      <div className="gs-radio-row">
        {options.map((opt, i) => (
          <span key={opt.value} className="gs-radio-item-wrap">
            <button
              type="button"
              role="radio"
              aria-checked={opt.value === value}
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={
                'gs-radio-item' + (opt.value === value ? ' active' : '')
              }
            >
              {opt.label}
            </button>
            {i < options.length - 1 ? (
              <span className="gs-radio-divider" aria-hidden="true">·</span>
            ) : null}
          </span>
        ))}
      </div>
      {active?.consequence ? (
        <p className="gs-radio-consequence">{active.consequence}</p>
      ) : null}
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
