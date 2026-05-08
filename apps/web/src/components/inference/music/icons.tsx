import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

export const IconPlay    = (p: P) => <svg viewBox="0 0 16 16" {...p}><path fill="currentColor" d="M4 2.5v11l10-5.5z"/></svg>
export const IconPause   = (p: P) => <svg viewBox="0 0 16 16" {...p}><rect x="4" y="3" width="3" height="10" fill="currentColor"/><rect x="9" y="3" width="3" height="10" fill="currentColor"/></svg>
export const IconSearch  = (p: P) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...p}><circle cx="7" cy="7" r="5"/><path d="m11 11 3 3"/></svg>
export const IconStar    = (p: P) => <svg viewBox="0 0 16 16" {...p}><path fill="currentColor" d="m8 1.5 2 4.5 5 .5-3.7 3.4 1.1 4.9L8 12.5 3.6 14.8l1.1-4.9L1 6.5l5-.5z"/></svg>
export const IconStarOut = (p: P) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" {...p}><path d="m8 1.5 2 4.5 5 .5-3.7 3.4 1.1 4.9L8 12.5 3.6 14.8l1.1-4.9L1 6.5l5-.5z"/></svg>
export const IconPlus    = (p: P) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="M8 3v10M3 8h10"/></svg>
export const IconUpload  = (p: P) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...p}><path d="M8 11V2m0 0L4.5 5.5M8 2l3.5 3.5M2.5 11v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2"/></svg>
export const IconQueue   = (p: P) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...p}><path d="M2 4h12M2 8h8M2 12h6" strokeLinecap="round"/><path fill="currentColor" stroke="none" d="M12 9.5v5l3.5-2.5z"/></svg>
export const IconX       = (p: P) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><path d="m4 4 8 8M12 4l-8 8"/></svg>
export const IconSkip    = (p: P) => <svg viewBox="0 0 16 16" {...p}><path fill="currentColor" d="M3 3v10l7-5zM10 3v10h2V3z"/></svg>
export const IconBack    = (p: P) => <svg viewBox="0 0 16 16" {...p}><path fill="currentColor" d="M13 3v10l-7-5zM6 3v10H4V3z"/></svg>
export const IconVolume  = (p: P) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...p}><path d="M2 6v4h2.5L8 13V3L4.5 6zM11 5.5a3 3 0 0 1 0 5M13 3.5a6 6 0 0 1 0 9"/></svg>
export const IconLink    = (p: P) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...p}><path d="M7 9a3 3 0 0 0 4 0l2-2a3 3 0 0 0-4-4L8 4M9 7a3 3 0 0 0-4 0l-2 2a3 3 0 0 0 4 4l1-1"/></svg>
export const IconFolder  = (p: P) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" {...p}><path d="M2 5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/></svg>
