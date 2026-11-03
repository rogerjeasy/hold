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
  advocate: 'hold',
  transcript: {
    id: 'negotiation-1', kind: 'negotiation', state: 'agreed', endedReason: null, currency: 'EUR', claimTotalCents: 35_00, agreedCents: 17_50, deadline: at, roundLimit: 6, shopConfirmedAt: null, renterConfirmedAt: null, simulated: false, sample: false, chainVerified: true,
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

  it('says when the renter’s own assistant argues for them, and names its moves as the assistant’s', () => {
    const move = { sequence: 2, side: 'renter' as const, kind: 'offer' as const, lines: [{ lineId: 'scratch', cents: 17_50, ground: 'uncertain_evidence' as const, evidence: [] }], totalCents: 17_50, passReason: null, actor: 'renter_assistant', model: null, createdAt: at, fingerprint: 'b'.repeat(64) }
    renderWithIntl(<RenterNegotiationScreen token="token" shopName="Porto Bikes" data={{ ...data, advocate: 'assistant', transcript: { ...data.transcript, moves: [...data.transcript.moves, move] } }} />)
    expect(screen.getByText("Your own assistant argues your contest. Hold's advocate does not move for you, and every move passes Hold's referee.")).toBeInTheDocument()
    expect(screen.getByText(/Move 2 · The renter's own assistant/)).toBeInTheDocument()
  })

  it('offers nothing to confirm or stop once it has ended, and says when the renter stopped it', () => {
    renderWithIntl(<RenterNegotiationScreen token="token" shopName="Porto Bikes" data={{ ...data, awaitingRenter: false, stopped: true, transcript: { ...data.transcript, state: 'escalated', endedReason: 'mandate_ended', agreedCents: null } }} />)
    expect(screen.queryByRole('button', { name: 'Confirm and settle' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop my advocate' })).not.toBeInTheDocument()
    expect(screen.getByText('You stopped your advocate.')).toBeInTheDocument()
  })
})
