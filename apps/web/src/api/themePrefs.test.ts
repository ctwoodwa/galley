import { beforeEach, describe, expect, it } from 'vitest'
import {
  defaultThemePrefs,
  resolveMode,
  useThemePrefs,
} from './themePrefs'

function resetStore(): void {
  window.localStorage.clear()
  useThemePrefs.setState(defaultThemePrefs())
}

describe('useThemePrefs', () => {
  beforeEach(resetStore)

  it('defaults to stone family + auto mode + md/comfortable', () => {
    const state = useThemePrefs.getState()
    expect(state.family).toBe('stone')
    expect(state.mode).toBe('auto')
    expect(state.fontScale).toBe('md')
    expect(state.measure).toBe('comfortable')
  })

  it('setters mutate the store independently', () => {
    const { setFamily, setMode, setFontScale, setMeasure } = useThemePrefs.getState()
    setFamily('catppuccin')
    setMode('dark')
    setFontScale('lg')
    setMeasure('narrow')
    const next = useThemePrefs.getState()
    expect(next.family).toBe('catppuccin')
    expect(next.mode).toBe('dark')
    expect(next.fontScale).toBe('lg')
    expect(next.measure).toBe('narrow')
  })

  it('resetTheme restores defaults', () => {
    useThemePrefs.getState().setFamily('solarized')
    useThemePrefs.getState().setMode('light')
    useThemePrefs.getState().resetTheme()
    expect(useThemePrefs.getState()).toMatchObject(defaultThemePrefs())
  })
})

describe('resolveMode', () => {
  it('auto + system-light → light', () => {
    expect(resolveMode('auto', false)).toBe('light')
  })
  it('auto + system-dark → dark', () => {
    expect(resolveMode('auto', true)).toBe('dark')
  })
  it('light is sticky regardless of system', () => {
    expect(resolveMode('light', false)).toBe('light')
    expect(resolveMode('light', true)).toBe('light')
  })
  it('dark is sticky regardless of system', () => {
    expect(resolveMode('dark', false)).toBe('dark')
    expect(resolveMode('dark', true)).toBe('dark')
  })
})
