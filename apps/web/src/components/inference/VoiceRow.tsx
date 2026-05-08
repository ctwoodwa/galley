import type { VoiceInfo } from '@galley/api-client'

interface VoiceRowProps {
  voice: VoiceInfo
  selected: boolean
  onSelect: () => void
  onDelete?: () => void
  isFavorite?: boolean
  onFavoriteToggle?: () => void
  /** Human-readable name shown prominently */
  displayName: string
  /** Contextual label: gender, language, "custom", etc. */
  subtitle?: string
}

export function VoiceRow({
  voice, selected, onSelect, onDelete, isFavorite, onFavoriteToggle,
  displayName, subtitle,
}: VoiceRowProps) {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-l-2 ${
        selected
          ? 'bg-amber-400/10 border-amber-400'
          : 'border-transparent hover:bg-stone-800/60'
      }`}
    >
      {/* Name + technical ID */}
      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
        <span className={`text-sm font-medium leading-tight truncate transition-colors ${
          selected ? 'text-stone-100' : 'text-stone-200 group-hover:text-stone-100'
        }`}>
          {displayName}
        </span>
        <div className="flex items-center gap-1 min-w-0">
          {subtitle && (
            <>
              <span className="text-[11px] text-stone-500 leading-none flex-shrink-0">{subtitle}</span>
              <span className="text-stone-700 text-[10px] leading-none flex-shrink-0">·</span>
            </>
          )}
          <span className={`font-mono text-[10px] leading-none truncate transition-colors ${
            selected ? 'text-stone-600' : 'text-stone-700 group-hover:text-stone-500'
          }`}>
            {voice.id}
          </span>
          {!voice.is_stock && (
            <span className="ml-1 text-[9px] px-1 py-px rounded bg-green-900/40 text-green-500 flex-shrink-0 leading-none font-medium tracking-wide uppercase">
              custom
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {onFavoriteToggle && (
          <button
            onClick={(e) => { e.stopPropagation(); onFavoriteToggle() }}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-label={isFavorite ? `Unfavorite ${displayName}` : `Favorite ${displayName}`}
            className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors ${
              isFavorite ? 'text-amber-400 !opacity-100' : 'text-stone-600 hover:text-amber-400'
            }`}
            style={isFavorite ? { opacity: 1 } : undefined}
          >
            ★
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            disabled={voice.is_stock}
            title={voice.is_stock ? 'Stock voices cannot be deleted' : `Delete ${displayName}`}
            className="w-6 h-6 flex items-center justify-center rounded text-stone-600 hover:text-red-400 disabled:opacity-20 disabled:cursor-not-allowed text-base leading-none transition-colors"
            aria-label={`Delete ${displayName}`}
          >
            ×
          </button>
        )}
      </div>

      {/* Favorite star always visible when active (overrides opacity-0 on group) */}
      {isFavorite && onFavoriteToggle && (
        <button
          onClick={(e) => { e.stopPropagation(); onFavoriteToggle() }}
          title="Remove from favorites"
          aria-label={`Unfavorite ${displayName}`}
          className="absolute right-3 w-6 h-6 flex items-center justify-center text-xs text-amber-400 group-hover:hidden"
          aria-hidden="true"
        >
          ★
        </button>
      )}
    </div>
  )
}
