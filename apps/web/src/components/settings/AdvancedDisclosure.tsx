import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

export interface AdvancedDisclosureProps {
  /** Trigger label. Defaults to "Show advanced". */
  label?: string
  /** Optional label when expanded. Defaults to "Hide advanced". */
  expandedLabel?: string
  /** Force open on mount (e.g., when an error inside is visible). */
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * Reveals advanced fields inline. Per `docs/settings/ia.md`,
 * progressive disclosure is one of two patterns galley settings
 * use (the other is the preset shortcut); this is the inline form.
 *
 * Not animated by design — the discoverable thing is the chevron;
 * the content snap-in keeps the section layout predictable.
 */
export function AdvancedDisclosure({
  label = 'Show advanced',
  expandedLabel = 'Hide advanced',
  defaultOpen = false,
  children,
}: AdvancedDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronRight
          className={
            'w-3 h-3 transition-transform ' + (open ? 'rotate-90' : '')
          }
          aria-hidden="true"
        />
        <span>{open ? expandedLabel : label}</span>
      </button>
      {open ? <div className="mt-3 space-y-4">{children}</div> : null}
    </div>
  )
}
