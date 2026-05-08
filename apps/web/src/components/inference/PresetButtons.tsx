import type { KnobValues } from '@galley/api-client'

export const PRESETS: Record<string, KnobValues> = {
  Neutral:   { exaggeration: 0.5, cfg_weight: 0.5, temperature: 0.8, speed: 1.0 },
  Subdued:   { exaggeration: 0.3, cfg_weight: 0.7, temperature: 0.5, speed: 1.0 },
  Dramatic:  { exaggeration: 0.7, cfg_weight: 0.3, temperature: 0.7, speed: 1.0 },
  Audiobook: { exaggeration: 0.5, cfg_weight: 0.5, temperature: 0.5, speed: 1.0 },
}

interface PresetButtonsProps {
  onSelect: (values: KnobValues) => void
}

export function PresetButtons({ onSelect }: PresetButtonsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(PRESETS).map(([name, values]) => (
        <button
          key={name}
          type="button"
          onClick={() => onSelect(values)}
          className="px-2.5 py-1 text-xs rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 border border-stone-700 hover:border-stone-600 transition-all font-medium"
        >
          {name}
        </button>
      ))}
    </div>
  )
}
