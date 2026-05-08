interface KnobSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  warn?: (value: number) => string | null
  defaultValue?: number
}

export function KnobSlider({ label, value, min, max, step, onChange, warn, defaultValue }: KnobSliderProps) {
  const warning = warn?.(value) ?? null
  const id = label.toLowerCase().replace(/\s+/g, '-')
  const pct = ((value - min) / (max - min)) * 100
  const isModified = defaultValue !== undefined && Math.abs(value - defaultValue) > step * 0.1

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <label htmlFor={id} className="text-xs font-medium tracking-wider uppercase text-stone-500">
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          {isModified && (
            <button
              type="button"
              onClick={() => onChange(defaultValue!)}
              title={`Reset to ${defaultValue}`}
              aria-label={`Reset ${label} to default`}
              tabIndex={-1}
              className="text-[11px] text-stone-600 hover:text-amber-400 transition-colors leading-none select-none"
            >
              ↺
            </button>
          )}
          <span className={`font-mono text-sm tabular-nums transition-colors ${isModified ? 'text-amber-400' : 'text-amber-600'}`}>
            {value.toFixed(2)}
          </span>
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(max, parseFloat((value + step).toFixed(10))))
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(min, parseFloat((value - step).toFixed(10))))
        }}
        style={{
          background: `linear-gradient(to right, #fbbf24 0%, #fbbf24 ${pct}%, #44403c ${pct}%, #44403c 100%)`,
        }}
      />
      {warning && <p className="text-xs text-yellow-400">{warning}</p>}
    </div>
  )
}
