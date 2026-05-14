import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

export interface AdvancedDisclosureProps {
  label?: string
  expandedLabel?: string
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * Reveals advanced fields inline. Trigger is a small italic
 * "show advanced" link with a vermilion chevron — no heavy chrome.
 */
export function AdvancedDisclosure({
  label = 'show advanced',
  expandedLabel = 'hide advanced',
  defaultOpen = false,
  children,
}: AdvancedDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="gs-disclosure">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="gs-disclosure-trigger"
      >
        <ChevronRight
          size={12}
          className={'gs-disclosure-chevron' + (open ? ' open' : '')}
          aria-hidden="true"
        />
        <span>{open ? expandedLabel : label}</span>
      </button>
      {open ? <div className="gs-disclosure-body">{children}</div> : null}
    </div>
  )
}
