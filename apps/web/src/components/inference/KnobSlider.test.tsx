import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KnobSlider } from './KnobSlider'

describe('KnobSlider', () => {
  it('renders label and value', () => {
    render(<KnobSlider label="Exaggeration" value={0.5} min={0} max={1.5} step={0.05} onChange={() => {}} />)
    expect(screen.getByText('Exaggeration')).toBeInTheDocument()
    expect(screen.getByText('0.50')).toBeInTheDocument()
  })

  it('calls onChange when slider moves', async () => {
    const onChange = vi.fn()
    render(<KnobSlider label="Speed" value={1.0} min={0.5} max={2.0} step={0.05} onChange={onChange} />)
    const slider = screen.getByRole('slider')
    await userEvent.type(slider, '{arrowright}')
    expect(onChange).toHaveBeenCalledWith(1.05)
  })

  it('shows warning when warn condition is met', () => {
    render(
      <KnobSlider
        label="Speed"
        value={1.5}
        min={0.5}
        max={2.0}
        step={0.05}
        onChange={() => {}}
        warn={(v) => v < 0.92 || v > 1.08 ? 'Time-stretch sounds artificial at this value' : null}
      />
    )
    expect(screen.getByText('Time-stretch sounds artificial at this value')).toBeInTheDocument()
  })

  it('does not show warning when condition is not met', () => {
    render(
      <KnobSlider
        label="Speed"
        value={1.0}
        min={0.5}
        max={2.0}
        step={0.05}
        onChange={() => {}}
        warn={(v) => v < 0.92 || v > 1.08 ? 'warning' : null}
      />
    )
    expect(screen.queryByText('warning')).not.toBeInTheDocument()
  })
})
