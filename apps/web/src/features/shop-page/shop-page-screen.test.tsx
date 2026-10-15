import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ShopPageScreen } from './shop-page-screen'
import type { ShopPageScreenProps } from './shop-page-screen'

vi.mock('./actions', () => ({ bookOnShopPage: () => Promise.resolve(null) }))

const props: ShopPageScreenProps = {
  shop: { slug: 'ribeira-bikes', name: 'Ribeira Bikes', currency: 'EUR' },
  open: true,
  period: { from: '2026-10-16T10:00', to: '2026-10-19T10:00', days: 3, invalid: false, period: { startsAt: new Date('2026-10-16T09:00:00Z'), endsAt: new Date('2026-10-19T09:00:00Z') } },
  types: [{ id: 'type-ebike', name: 'City e-bike', category: 'e_bike', currency: 'EUR', dayRateCents: 40_00, holdCents: 300_00, available: 2 }],
  prices: [{ description: 'Scratched frame', category: 'damage', amountCents: 35_00 }],
  wearPolicy: 'Light scuffs are ordinary wear.',
}

describe('a shop’s own page', () => {
  it('lets a renter choose dates and items, with the prices they agree to beside them', () => {
    renderWithIntl(<ShopPageScreen {...props} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Rent from Ribeira Bikes')
    expect(screen.getByLabelText('Pick up')).toHaveValue('2026-10-16T10:00')
    expect(screen.getByRole('button', { name: 'One more City e-bike' })).toBeEnabled()
    expect(screen.getByText('Scratched frame')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Book and pay the fee' })).toBeInTheDocument()
  })

  it('says when the shop does not take bookings online yet', () => {
    renderWithIntl(<ShopPageScreen {...props} open={false} />)
    expect(screen.getByText('Not taking bookings online yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Book and pay the fee' })).not.toBeInTheDocument()
  })
})
