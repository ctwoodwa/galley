import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PresetButtons, PRESETS } from './PresetButtons'

describe('PresetButtons', () => {
  it('renders all four preset buttons', () => {
    render(<PresetButtons onSelect={() => {}} />)
    expect(screen.getByText('Neutral')).toBeInTheDocument()
    expect(screen.getByText('Subdued')).toBeInTheDocument()
    expect(screen.getByText('Dramatic')).toBeInTheDocument()
    expect(screen.getByText('Audiobook')).toBeInTheDocument()
  })

  it('calls onSelect with correct values for Dramatic', async () => {
    const onSelect = vi.fn()
    render(<PresetButtons onSelect={onSelect} />)
    await userEvent.click(screen.getByText('Dramatic'))
    expect(onSelect).toHaveBeenCalledWith(PRESETS.Dramatic)
  })

  it('calls onSelect with correct values for Subdued', async () => {
    const onSelect = vi.fn()
    render(<PresetButtons onSelect={onSelect} />)
    await userEvent.click(screen.getByText('Subdued'))
    expect(onSelect).toHaveBeenCalledWith(PRESETS.Subdued)
  })
})
