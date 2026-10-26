import { money } from '@hold/domain'
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { TrustScreen } from './trust-screen'
import type { TrustScreenProps } from './trust-screen'

vi.mock('./actions', () => ({ publishLadder: () => Promise.resolve(null), replayLadder: () => Promise.resolve(null) }))
vi.mock('@/features/auth/passkey-button', () => ({ PasskeyButton: ({ label }: { label: string }) => <button type="button">{label}</button> }))

const eur = (cents: number) => money(cents, 'EUR')
const props = (overrides: Partial<TrustScreenProps> = {}): TrustScreenProps => ({
  shopName: 'Ribeira Bikes',
  timeZone: 'Europe/Lisbon',
  current: {
    id: 'ladder-2',
    version: 2,
    publishedAt: new Date('2026-10-20T09:00:00Z'),
    ladder: {
      currency: 'EUR',
      history: 'network',
      windowMonths: 24,
      minimumFee: eur(20_00),
      minimumHours: 4,
      rungs: [
        { cleanReturns: 3, sharePercent: 75, largestValue: eur(2000_00), needsSavedMethod: false },
        { cleanReturns: 10, sharePercent: 0, largestValue: eur(1000_00), needsSavedMethod: true },
      ],
    },
  },
  currency: 'EUR',
  canPublish: true,
  gate: { needed: false, hasPasskey: true, email: 'ana@ribeira.example' },
  ledger: [{ rentalId: '00000000-0000-4000-8000-0000000000a1', outcome: 'clean', closedAt: new Date('2026-10-22T09:00:00Z'), counts: true, itemCategory: 'e_bike' }],
  ...overrides,
})

describe('the trust ladder page', () => {
  it('shows the published version, its rungs and what counts, and says a rung needing a saved method is not reached', () => {
    renderWithIntl(<TrustScreen {...props()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Trust ladder')
    expect(screen.getByText(/Version 2 is published/)).toBeInTheDocument()
    expect(screen.getByText('3 clean returns: 75% of the hold, for items worth up to €2,000.00')).toBeInTheDocument()
    expect(screen.getByText('Needs a saved PayPal method, so it is not reached yet.')).toBeInTheDocument()
    expect(screen.getByText(/A rental counts from a fee of €20.00 and 4 hours/)).toBeInTheDocument()
  })

  it('offers the owner the editor, the replay and the note on saved methods', () => {
    renderWithIntl(<TrustScreen {...props()} />)
    expect(screen.getByRole('button', { name: 'Publish this trust ladder' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Replay over past rentals' })).toBeInTheDocument()
    expect(screen.getByText(/Hold does not keep saved PayPal methods yet/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Rung 1: Clean returns needed' })).toHaveValue('3')
  })

  it('asks the owner for their passkey before the editor', () => {
    renderWithIntl(<TrustScreen {...props({ gate: { needed: true, hasPasskey: true, email: 'ana@ribeira.example' } })} />)
    expect(screen.queryByRole('button', { name: 'Publish this trust ladder' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm with my passkey' })).toBeInTheDocument()
  })

  it('shows everyone else the ladder and the ledger, and nothing to change', () => {
    renderWithIntl(<TrustScreen {...props({ canPublish: false })} />)
    expect(screen.getByText('Only the owner can publish a trust ladder.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publish this trust ladder' })).not.toBeInTheDocument()
    const ledger = screen.getByRole('region', { name: 'Trust ledger' })
    expect(within(ledger).getByText('Clean')).toBeInTheDocument()
    expect(within(ledger).getByRole('link', { name: 'See the rental' })).toHaveAttribute('href', '/shop/rentals/00000000-0000-4000-8000-0000000000a1')
  })

  it('says when no ladder is published, and when no rental has closed under it', () => {
    renderWithIntl(<TrustScreen {...props({ current: undefined, ledger: [] })} />)
    expect(screen.getByText('No trust ladder is published. Every renter is held for the ordinary amount.')).toBeInTheDocument()
    expect(screen.getByText('No rental has closed since the trust ladder began.')).toBeInTheDocument()
  })
})
