import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { SettlementLimitsScreen } from './settlement-limits-screen'

vi.mock('./actions', () => ({ saveSettlementLimits: vi.fn(), endSettlementLimits: vi.fn() }))
const current = { lowestSharePercent: 60, largestClaimCents: 200_00, rounds: 6, evidenceRequired: true, validUntil: new Date('2027-01-31T10:00:00Z') }

describe('the shop advocate’s limits', () => {
  it('shows the owner the current limits and the form to change or end them, with the final tap fixed on', () => {
    renderWithIntl(<SettlementLimitsScreen shopName="Ribeira Bikes" currency="EUR" current={current} canEdit />)
    expect(screen.getByRole('heading', { level: 1, name: 'Settlement advocate' })).toBeInTheDocument()
    expect(screen.getByText(/At least 60% of a claim, on claims up to €200.00, at most 6 offers a side/)).toBeInTheDocument()
    expect(screen.getByText('You or a manager confirm every agreement before anything is charged.')).toBeInTheDocument()
    expect(screen.getByLabelText('Lowest share of a claim it may agree to, in percent')).toHaveValue(60)
    expect(screen.getByLabelText('Largest claim it may take on, in EUR')).toHaveValue('200.00')
    expect(screen.getByRole('button', { name: 'Save the limits' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'End the shop advocate' })).toBeInTheDocument()
  })

  it('shows anyone else no limits and no form', () => {
    renderWithIntl(<SettlementLimitsScreen shopName="Ribeira Bikes" currency="EUR" current={null} canEdit={false} />)
    expect(screen.getByText('Only the owner sets these limits.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save the limits' })).not.toBeInTheDocument()
    expect(screen.queryByText(/At least/)).not.toBeInTheDocument()
  })

  it('asks for prices first when the shop has no currency yet', () => {
    renderWithIntl(<SettlementLimitsScreen shopName="Ribeira Bikes" currency={null} current={null} canEdit />)
    expect(screen.getByText(/Publish your prices first/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save the limits' })).not.toBeInTheDocument()
  })
})
