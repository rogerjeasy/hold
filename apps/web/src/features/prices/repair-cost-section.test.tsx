import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { RepairCostSection } from './repair-cost-section'

vi.mock('./repair-cost-grid', () => ({ RepairCostGrid: () => null }))

const rows = [
  { id: 'scratch', description: 'Scratch on the frame, through the paint', priceCents: 35_00, repairs: 4, averageCents: 58_40, gapCents: -23_40, standing: 'below' as const },
  { id: 'hanger', description: 'Bent rear derailleur hanger', priceCents: 25_00, repairs: 2, averageCents: 18_00, gapCents: 7_00, standing: 'covers' as const },
]

describe('what repairs cost against the price list', () => {
  it('shows each costed price with its repairs, their average and whether the price covers them, in words', () => {
    renderWithIntl(<RepairCostSection rows={rows} currency="EUR" />)
    expect(screen.getByRole('heading', { name: 'What repairs cost' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'What repairs cost' })
    expect(within(list).getByText('Scratch on the frame, through the paint')).toBeInTheDocument()
    expect(within(list).getByText('Repaired 4 times, on average €58.40')).toBeInTheDocument()
    expect(within(list).getByText('Below repair cost')).toBeInTheDocument()
    expect(within(list).getByText('Covers repair cost')).toBeInTheDocument()
    expect(screen.getByText(/A price changes only when you publish a new price list/)).toBeInTheDocument()
  })

  it('shows nothing before a repair was costed', () => {
    const { container } = renderWithIntl(<RepairCostSection rows={[]} currency="EUR" />)
    expect(container).toBeEmptyDOMElement()
  })
})
