import type { ShopIncident } from '@hold/db'
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { IncidentsScreen } from './incidents-screen'

vi.mock('./actions', () => ({ confirmPrice: vi.fn(), takeOnAsShopMatter: vi.fn() }))

const reportedAt = new Date('2026-10-20T09:00:00Z')
const base: ShopIncident = {
  id: '00000000-0000-4000-8000-000000000001', rentalId: '00000000-0000-4000-8000-0000000000aa', state: 'triaged', sentAt: reportedAt, kind: 'small_damage', hint: 'damage', description: 'Scraped it on a bollard', safety: false,
  model: 'anthropic.claude-opus-5-5', triageOutcome: 'answered', simulated: false, currency: 'EUR', agreedCents: null, theftDetails: null, staffAlertedAt: reportedAt, reportedAt, itemLabel: 'City e-bike 2', renterName: 'Priya Natarajan', priceListId: 'list',
  suggestion: { id: 'scratch', description: 'Deep scratch', amountCents: 3500 }, offer: null,
  prices: [{ id: 'scratch', description: 'Deep scratch', amountCents: 3500 }, { id: 'dent', description: 'Dent', amountCents: 8000 }],
}
const clock = { timeZone: 'Europe/Lisbon', currency: 'EUR' }
const show = (incidents: readonly ShopIncident[], canAct = true) => renderWithIntl(<IncidentsScreen shopName="Ribeira Bikes" clock={clock} incidents={incidents} waitingOnly canAct={canAct} />)

describe('the incidents page', () => {
  it('quotes the renter, and asks staff to confirm the price the model only suggested', () => {
    show([base])
    const report = screen.getByRole('article', { name: /City e-bike 2/ })
    expect(within(report).getByText('Scraped it on a bollard')).toBeInTheDocument()
    expect(within(report).getByLabelText('Published price that applies')).toHaveValue('scratch')
    expect(within(report).getByRole('button', { name: 'Confirm this price for the renter' })).toBeInTheDocument()
    expect(within(report).getByRole('link', { name: 'Open the rental' })).toHaveAttribute('href', `/shop/rentals/${base.rentalId}`)
  })

  it('marks anything that could bear on safety, and lets staff take a waiting report on as the shop’s matter', () => {
    show([{ ...base, state: 'awaiting_staff', kind: 'unsafe_or_unclear', safety: true, suggestion: null, prices: [] }])
    expect(screen.getByText('Could bear on safety')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make it the shop’s matter' })).toBeInTheDocument()
  })

  it('says when the model did not sort it, and when an alert could not be sent', () => {
    show([{ ...base, state: 'awaiting_staff', kind: 'unsafe_or_unclear', triageOutcome: 'unavailable', model: 'anthropic.claude-opus-5-5', staffAlertedAt: null, suggestion: null, prices: [] }])
    expect(screen.getByText('Sorted by code alone: the model did not answer.')).toBeInTheDocument()
    expect(screen.getByText('No email reached staff. This page is the alert.')).toBeInTheDocument()
  })

  it('says when the sorting was the test environment’s stand-in', () => {
    show([{ ...base, model: 'simulated', simulated: true }])
    expect(screen.getByText('Sorted by a stand-in for the test environment, checked by code.')).toBeInTheDocument()
  })

  it('leaves read-only members without controls', () => {
    show([base], false)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('says when nothing waits', () => {
    show([])
    expect(screen.getByText('Nothing waits for a person.')).toBeInTheDocument()
  })
})
