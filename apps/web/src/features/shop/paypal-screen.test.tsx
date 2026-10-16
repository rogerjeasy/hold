import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { PayPalScreen } from './paypal-screen'

vi.mock('./actions', () => ({ connectPayPal: () => Promise.resolve(null), turnOnPayPalNotifications: () => Promise.resolve(null) }))

const gate = { needed: false, hasPasskey: true, email: 'ana@ribeira.example' }

describe('the PayPal page', () => {
  it('says PayPal tells Hold what happens to each payment', () => {
    renderWithIntl(<PayPalScreen shopName="Ribeira Bikes" connectedAt={new Date('2026-10-14T09:00:00Z')} notifications isOwner gate={gate} />)
    expect(screen.getByText(/PayPal tells Hold/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).not.toBeInTheDocument()
  })

  it('offers the owner to turn notifications on when PayPal does not send them yet', () => {
    renderWithIntl(<PayPalScreen shopName="Ribeira Bikes" connectedAt={new Date('2026-10-14T09:00:00Z')} notifications={false} isOwner gate={gate} />)
    expect(screen.getByText(/does not tell Hold yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument()
  })
})
