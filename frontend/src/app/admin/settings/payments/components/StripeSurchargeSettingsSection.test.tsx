import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StripeSurchargeSettingsSection } from './StripeSurchargeSettingsSection'
import type { StripeSurchargeFormValue } from './stripe-surcharge-form'

const value: StripeSurchargeFormValue = {
  enabled: false,
  percentage: '2.65',
  fixedAmount: '0.30',
  disclosureText: 'Exact customer disclosure.',
  calculationVersion: 'stripe-gross-up-v1',
}

describe('StripeSurchargeSettingsSection', () => {
  it('renders saved disabled values and a read-only calculation version', () => {
    render(<StripeSurchargeSettingsSection mode="Test" value={value} onChange={() => {}} />)
    expect(screen.getByRole('checkbox', { name: /Enable card processing surcharge/ })).not.toBeChecked()
    expect(screen.getByLabelText('Percentage rate')).toHaveValue('2.65')
    expect(screen.getByLabelText('Fixed fee')).toHaveValue('0.30')
    expect(screen.getByLabelText('Customer disclosure')).toHaveValue('Exact customer disclosure.')
    expect(screen.getByText('stripe-gross-up-v1')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Calculation version' })).not.toBeInTheDocument()
  })

  it('updates only enabled while retaining prepared values', async () => {
    const onChange = vi.fn()
    render(<StripeSurchargeSettingsSection mode="Test" value={value} onChange={onChange} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /Enable card processing surcharge/ }))
    expect(onChange).toHaveBeenCalledWith({ ...value, enabled: true })
  })

  it('shows the disclosure counter and accessible linked errors', () => {
    render(
      <StripeSurchargeSettingsSection
        mode="Live"
        value={{ ...value, enabled: true }}
        onChange={() => {}}
        errors={{ percentage: 'Enter a percentage from 0.00 to 99.99.', fixedAmount: 'Enter a fixed fee of 0.00 or more.', disclosureText: 'Enter a customer disclosure message.' }}
      />,
    )
    expect(screen.getByText('26 / 500 characters')).toBeInTheDocument()
    for (const label of ['Percentage rate', 'Fixed fee', 'Customer disclosure']) {
      const input = screen.getByLabelText(label)
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input.getAttribute('aria-describedby')).toContain('error')
    }
    expect(screen.getByText(/future Stripe Live card payments/)).toBeInTheDocument()
  })

  it('disables every control in locked/read-only mode', () => {
    render(<StripeSurchargeSettingsSection mode="Live" value={value} onChange={() => {}} disabled />)
    expect(screen.getByRole('checkbox', { name: /Enable card/ })).toBeDisabled()
    expect(screen.getByLabelText('Percentage rate')).toBeDisabled()
    expect(screen.getByLabelText('Fixed fee')).toBeDisabled()
    expect(screen.getByLabelText('Customer disclosure')).toBeDisabled()
  })
})
