import type { ReactNode } from 'react'

export interface EntryCardProps {
  /** Numbered prefix shown in the left gutter — usually 01, 02, …
   *  but any short label works (e.g., section roman numeral). */
  numeral: string
  /** Card title — shown in the header row, left side. */
  title: ReactNode
  /** Typography for the title.
   *   - `'mono'` — JetBrains Mono, used for technical identifiers
   *     like capability slot ids (`tts/fast`, `image`, …).
   *   - `'display'` — serif body face (Lora), used for human names
   *     like book display names. */
  titleVariant?: 'mono' | 'display'
  /** Italic subtitle — provider label, id, or any short metadata. */
  subtitle?: ReactNode
  /** When true, paints a vermilion left-rule + faint paper-tint
   *  background to flag the card as the "active" entry in its list. */
  active?: boolean
  /** Field stack and any other body content. */
  children: ReactNode
}

/**
 * Shared registry/slot card primitive. Used by both ServicesSection
 * (one card per capability slot, mono title) and BooksSection (one
 * card per registered book, display-serif title + active-state
 * vermilion rule).
 *
 * Title and subtitle live in a single flex header row; the numeral
 * gutter is fixed-width (3rem) so card bodies align across a vertical
 * stack regardless of title length.
 */
export function EntryCard({
  numeral,
  title,
  titleVariant = 'mono',
  subtitle,
  active = false,
  children,
}: EntryCardProps) {
  return (
    <div
      className={'gs-entry-card' + (active ? ' active' : '')}
      data-title-variant={titleVariant}
    >
      <div className="gs-entry-numeral" aria-hidden="true">
        {numeral}
      </div>
      <div className="gs-entry-body">
        <div className="gs-entry-header">
          <span className="gs-entry-title">{title}</span>
          {subtitle ? <span className="gs-entry-subtitle">{subtitle}</span> : null}
        </div>
        {children}
      </div>
    </div>
  )
}
