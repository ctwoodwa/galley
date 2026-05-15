/**
 * Cross-component bridge for "jump to this text in the chapter view."
 *
 * The telemetry panel knows about findings (text excerpts + char
 * offsets in the stripped prose). The ChapterView knows about DOM
 * coordinates. They don't share a parent that owns both — so the
 * bridge is a window-level CustomEvent the panel emits and the
 * ChapterView listens for.
 *
 * No URL-bar coupling, no routing — this is purely a one-shot scroll
 * action triggered by user click.
 */

export interface ScrollToTextDetail {
  /** Verbatim text to locate. Adapters should pass enough context to
   *  disambiguate (≥20 chars) so the first match in the chapter is
   *  the intended one. */
  text: string
  /** Optional finding type for visual styling of the flash highlight
   *  (e.g. 'blocker' / 'warning' tints the flash differently). */
  severity?: 'blocker' | 'warning' | 'info'
}

export const SCROLL_TO_TEXT_EVENT = 'galley:scroll-to-text'

export function emitScrollToText(detail: ScrollToTextDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<ScrollToTextDetail>(SCROLL_TO_TEXT_EVENT, { detail }),
  )
}

/**
 * Find the first DOM Text node inside `root` whose textContent contains
 * `needle`, and return a Range covering the match. Used by ChapterView's
 * scrollToText handler.
 *
 * Walks the tree iteratively so very long chapters don't blow the
 * recursion stack. Case-insensitive; matches the first occurrence.
 */
export function findTextRange(root: Node, needle: string): Range | null {
  if (!needle || needle.length < 3) return null
  const search = needle.toLowerCase()

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  let node: Node | null = walker.nextNode()
  while (node) {
    const text = (node as Text).data
    if (text) {
      const idx = text.toLowerCase().indexOf(search)
      if (idx !== -1) {
        const range = document.createRange()
        range.setStart(node, idx)
        range.setEnd(node, idx + needle.length)
        return range
      }
    }
    node = walker.nextNode()
  }
  return null
}

/**
 * Scroll the given range into view + briefly highlight the matched
 * text. The highlight is implemented as a transient wrapping `<mark>`
 * with a CSS animation; it auto-unwraps after 2.5s so the chapter
 * DOM returns to its original shape.
 */
export function scrollRangeIntoView(
  range: Range,
  severity: ScrollToTextDetail['severity'] = 'info',
): void {
  try {
    const mark = document.createElement('mark')
    mark.className = `galley-scroll-flash galley-scroll-flash-${severity}`
    range.surroundContents(mark)
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => {
      const parent = mark.parentNode
      if (!parent) return
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
      parent.removeChild(mark)
      parent.normalize()
    }, 2500)
  } catch {
    // surroundContents throws if the range crosses element boundaries.
    // Fall back to just scrolling — no highlight, but the user still
    // sees the relevant prose come into view.
    const rect = range.getBoundingClientRect()
    window.scrollTo({
      top: window.scrollY + rect.top - 200,
      behavior: 'smooth',
    })
  }
}
