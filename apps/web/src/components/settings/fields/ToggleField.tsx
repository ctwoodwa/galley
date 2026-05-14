import { useId } from 'react'

export interface ToggleFieldProps {
  label: string
  value: boolean
  onChange: (next: boolean) => void
  helperText?: string
  disabled?: boolean
}

/**
 * Editorial toggle: a small-caps ON / OFF chip instead of a slider.
 * Reads like a printer's mark; vermilion fill when active.
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
    <div className="gs-toggle">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-labelledby={`${id}-label`}
        aria-describedby={helperText ? helpId : undefined}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={'gs-toggle-control' + (value ? ' on' : '')}
      >
        {value ? 'on' : 'off'}
      </button>
      <div className="gs-toggle-label-area">
        <label
          id={`${id}-label`}
          className="gs-toggle-label"
          onClick={() => !disabled && onChange(!value)}
        >
          {label}
        </label>
        {helperText ? (
          <p id={helpId} className="gs-field-helper" style={{ marginTop: '2px' }}>
            {helperText}
          </p>
        ) : null}
      </div>
    </div>
  )
}
