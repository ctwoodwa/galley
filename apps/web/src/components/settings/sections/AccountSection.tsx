import { Palette } from 'lucide-react'
import {
  FONT_SCALES,
  READER_MEASURES,
  THEME_FAMILIES,
  type FontScale,
  type ReaderMeasure,
  type ThemeFamily,
  type ThemeMode,
  useThemePrefs,
} from '@/api/themePrefs'
import { SettingsSection } from '../SettingsSection'
import { RadioField } from '../fields/RadioField'

/**
 * Account — user-scope visual preferences. Theme family, light/dark
 * mode, font scale, and reader column width. Persisted to localStorage
 * via `useThemePrefs`; applied at runtime by `ThemeProvider`.
 *
 * Identity / device keypair / token rotation are deferred until
 * kernel-sync ships. Today galley has no auth — "the user" is whoever
 * has the laptop — so there's nothing here to bind those knobs to.
 */
export function AccountSection() {
  const family = useThemePrefs((s) => s.family)
  const mode = useThemePrefs((s) => s.mode)
  const fontScale = useThemePrefs((s) => s.fontScale)
  const measure = useThemePrefs((s) => s.measure)
  const setFamily = useThemePrefs((s) => s.setFamily)
  const setMode = useThemePrefs((s) => s.setMode)
  const setFontScale = useThemePrefs((s) => s.setFontScale)
  const setMeasure = useThemePrefs((s) => s.setMeasure)

  return (
    <SettingsSection
      title="Account"
      numeral="I"
      description="Visual theme, typography, and reading-column width — applied across the writing surfaces. Identity, device keypair, and bearer-token rotation arrive with kernel-sync."
      scope="user"
    >
      <ThemeFamilyField value={family} onChange={setFamily} />

      <RadioField<ThemeMode>
        label="Light / dark"
        value={mode}
        onChange={setMode}
        options={[
          {
            value: 'auto',
            label: 'auto',
            consequence:
              'Follow the system preference. Switches automatically when macOS / Windows flips between light and dark mode.',
          },
          {
            value: 'light',
            label: 'light',
            consequence:
              'Always use the light variant of the chosen palette, even when the system is set to dark.',
          },
          {
            value: 'dark',
            label: 'dark',
            consequence:
              'Always use the dark variant of the chosen palette, even when the system is set to light.',
          },
        ]}
      />

      <RadioField<FontScale>
        label={'Text size'}
        value={fontScale}
        onChange={setFontScale}
        options={[
          { value: 'sm', label: 'small', consequence: 'Tighter text. Best for high-res displays and dense review work.' },
          { value: 'md', label: 'medium', consequence: 'Default reading size.' },
          { value: 'lg', label: 'large', consequence: 'Easier on the eyes for long drafting sessions or smaller laptops.' },
        ]}
        helperText="Applies to writing-surface body text. Headings scale with it."
      />

      <RadioField<ReaderMeasure>
        label="Reader column width"
        value={measure}
        onChange={setMeasure}
        options={[
          { value: 'narrow',     label: 'narrow',     consequence: '60ch — eye-friendly for focused passes; less context per screen.' },
          { value: 'comfortable',label: 'comfortable',consequence: '70ch — typographic sweet spot; default.' },
          { value: 'wide',       label: 'wide',       consequence: '80ch — more context per screen; harder for the eyes on long stretches.' },
        ]}
        helperText="Max column width on the writing surface. Affects /read and /settings."
      />
    </SettingsSection>
  )
}

interface ThemeFamilyFieldProps {
  value: ThemeFamily
  onChange: (next: ThemeFamily) => void
}

/**
 * Theme-family picker — three radio swatches with live-preview color
 * dots that read from the theme's own CSS variables. Picking a family
 * re-runs ThemeProvider, which flips `data-theme="…"` and triggers
 * a paint with the new tokens.
 */
function ThemeFamilyField({ value, onChange }: ThemeFamilyFieldProps) {
  const meta: Record<ThemeFamily, { label: string; consequence: string }> = {
    stone: {
      label: 'stone',
      consequence:
        'Neutral warm-grey palette. Calm, professional, low chroma. Default.',
    },
    catppuccin: {
      label: 'catppuccin',
      consequence:
        'Latte (light) and Mocha (dark) — the editor-community palette. Soft pastels with a mauve primary.',
    },
    solarized: {
      label: 'solarized',
      consequence:
        'Eye-strain-tuned cyan-and-yellow classic. Strong fit for long reading sessions.',
    },
  }

  return (
    <div className="gs-field">
      <span className="gs-field-label">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <Palette size={12} aria-hidden="true" /> Theme family
        </span>
      </span>
      <div
        className="gs-radio-row"
        role="radiogroup"
        aria-label="Theme family"
        style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}
      >
        {THEME_FAMILIES.map((family) => (
          <button
            key={family}
            type="button"
            role="radio"
            aria-checked={family === value}
            onClick={() => onChange(family)}
            data-theme={family}
            className="gs-theme-swatch"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.75rem',
              border: family === value ? '2px solid hsl(var(--primary))' : '1px solid hsl(var(--border))',
              background: 'transparent',
              cursor: 'pointer',
              minWidth: '4.5rem',
            }}
          >
            <span style={{ display: 'flex', gap: '3px' }}>
              <span style={{ width: 12, height: 12, background: 'hsl(var(--background))',  border: '1px solid hsl(var(--border))' }} />
              <span style={{ width: 12, height: 12, background: 'hsl(var(--foreground))' }} />
              <span style={{ width: 12, height: 12, background: 'hsl(var(--primary))' }} />
              <span style={{ width: 12, height: 12, background: 'hsl(var(--accent))' }} />
            </span>
            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font)', color: 'hsl(var(--foreground))' }}>
              {meta[family].label}
            </span>
          </button>
        ))}
      </div>
      <p className="gs-field-helper" style={{ marginTop: '0.5rem' }}>
        {meta[value].consequence}
      </p>
    </div>
  )
}
