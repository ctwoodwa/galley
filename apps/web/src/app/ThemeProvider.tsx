import { useEffect } from 'react'
import {
  FONT_SCALE_VALUES,
  READER_MEASURE_VALUES,
  resolveMode,
  useThemePrefs,
} from '@/api/themePrefs'

/**
 * Listens to useThemePrefs + the system `prefers-color-scheme` media
 * query, applying the active theme to <html> via:
 *
 *   data-theme="<family>"   — selects palette tokens (see themes/index.css).
 *   class="dark"            — flips to the dark variant of that palette.
 *   --font-scale: <number>  — multiplier consumed by writing-surface text.
 *   --reader-measure: <ch>  — column max-width for the writing column.
 *
 * Renders no DOM of its own — mount once near the React root.
 */
export function ThemeProvider({ children }: { children?: React.ReactNode }) {
  const family = useThemePrefs((s) => s.family)
  const mode = useThemePrefs((s) => s.mode)
  const fontScale = useThemePrefs((s) => s.fontScale)
  const measure = useThemePrefs((s) => s.measure)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', family)

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const effective = resolveMode(mode, mql.matches)
      root.classList.toggle('dark', effective === 'dark')
    }
    apply()

    // Only the `auto` mode needs to react to system changes; an
    // explicit light/dark choice is sticky.
    if (mode === 'auto') {
      mql.addEventListener('change', apply)
      return () => mql.removeEventListener('change', apply)
    }
    return undefined
  }, [family, mode])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--font-scale', String(FONT_SCALE_VALUES[fontScale]))
    root.style.setProperty('--reader-measure', READER_MEASURE_VALUES[measure])
  }, [fontScale, measure])

  return <>{children}</>
}
