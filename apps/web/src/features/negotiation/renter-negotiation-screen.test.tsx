import type { RenterNegotiation } from '@hold/db'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { RenterNegotiationScreen } from './renter-negotiation-screen'

const at = new Date('2026-11-01T10:00:00Z')
const data: RenterNegotiation = {
  highestTotalCents: 30_00,
  awaitingRenter: true,
  stopped: false,
  transcript: {
    id: 'negotiation-1', kind: 'negotiation', state: 'agreed', endedReason: null, currency: 'EUR', claimTotalCents: 35_00, agreedCents: 17_50, deadline: at, roundLimit: 6, shopConfirmedAt: null, renterConfirmedAt: null, simulated: false, chainVerified: true,
    lines: [{ lineId: 'scratch', publishedCents: 35_00, description: 'Scratch' }], wearClauses: [],
    moves: [{ sequence: 1, side: 'shop', kind: 'offer', lines: [{ lineId: 'scratch', cents: 35_00, ground: null, evidence: [] }], totalCents: 35_00, passReason: null, actor: 'referee', model: null, createdAt: at, fingerprint: 'a'.repeat(64) }],
  },
}

describe('the renter’s advocate page', () => {
  it('shows their own limit to them alone, the agreement to confirm, and the way to stop the advocate', () => {
    renderWithIntl(<RenterNegotiationScreen token="token" shopName="Porto Bikes" data={data} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Your advocate' })).toBeInTheDocument()
    expect(screen.getByText('Your highest total: €30.00. Only you see this.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm and settle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop my advocate' })).toBeInTheDocument()
  })

  it('says, once the renter confirmed, that the agreement waits for the shop', () => {
    renderWithIntl(<RenterNegotiationScreen token="token" shopName="Porto Bikes" data={{ ...data, awaitingRenter: false, transcript: { ...data.transcript, renterConfirmedAt: at } }} />)
    expect(screen.getByText('You confirmed. Waiting for the shop to confirm.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm and settle' })).not.toBeInTheDocument()
  })

  it('offers nothing to confirm or stop once it has ended, and says when the renter stopped it', () => {
    renderWithIntl(<RenterNegotiationScreen token="token" shopName="Porto Bikes" data={{ ...data, awaitingRenter: false, stopped: true, transcript: { ...data.transcript, state: 'escalated', endedReason: 'mandate_ended', agreedCents: null } }} />)
    expect(screen.queryByRole('button', { name: 'Confirm and settle' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop my advocate' })).not.toBeInTheDocument()
    expect(screen.getByText('You stopped your advocate.')).toBeInTheDocument()
  })
})
