import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * User-scope visual theme preferences — drives ThemeProvider, which
 * applies the active palette (data-theme attr) + light/dark variant
 * (.dark class) + font + measure CSS vars to <html>.
 *
 * Default = stone family, auto mode (follows system preference). See
 * apps/web/src/styles/themes/index.css for the palette tokens.
 */

export const THEME_FAMILIES = ['stone', 'catppuccin', 'solarized'] as const
export type ThemeFamily = (typeof THEME_FAMILIES)[number]

export type ThemeMode = 'light' | 'dark' | 'auto'

export const FONT_SCALES = ['sm', 'md', 'lg'] as const
export type FontScale = (typeof FONT_SCALES)[number]

/** Map FontScale → root font-scale multiplier. */
export const FONT_SCALE_VALUES: Record<FontScale, number> = {
  sm: 0.9375,
  md: 1.0,
  lg: 1.125,
}

export const READER_MEASURES = ['narrow', 'comfortable', 'wide'] as const
export type ReaderMeasure = (typeof READER_MEASURES)[number]

/** Map ReaderMeasure → CSS max-width for the writing column. */
export const READER_MEASURE_VALUES: Record<ReaderMeasure, string> = {
  narrow: '60ch',
  comfortable: '70ch',
  wide: '80ch',
}

export interface ThemePrefs {
  family: ThemeFamily
  mode: ThemeMode
  fontScale: FontScale
  measure: ReaderMeasure
}

export function defaultThemePrefs(): ThemePrefs {
  return {
    family: 'stone',
    mode: 'auto',
    fontScale: 'md',
    measure: 'comfortable',
  }
}

interface ThemePrefsState extends ThemePrefs {
  setFamily: (family: ThemeFamily) => void
  setMode: (mode: ThemeMode) => void
  setFontScale: (scale: FontScale) => void
  setMeasure: (measure: ReaderMeasure) => void
  resetTheme: () => void
}

export const useThemePrefs = create<ThemePrefsState>()(
  persist(
    (set) => ({
      ...defaultThemePrefs(),
      setFamily: (family) => set({ family }),
      setMode: (mode) => set({ mode }),
      setFontScale: (fontScale) => set({ fontScale }),
      setMeasure: (measure) => set({ measure }),
      resetTheme: () => set(defaultThemePrefs()),
    }),
    {
      name: 'galley.theme-prefs',
      version: 1,
    },
  ),
)

/**
 * Resolve the effective light/dark mode from a `ThemeMode` setting,
 * consulting the system preference for `'auto'`. Pure function so
 * ThemeProvider can call it from a window listener AND tests can
 * exercise both branches.
 */
export function resolveMode(
  mode: ThemeMode,
  systemPrefersDark: boolean,
): 'light' | 'dark' {
  if (mode === 'auto') return systemPrefersDark ? 'dark' : 'light'
  return mode
}
