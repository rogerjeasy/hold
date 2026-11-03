import type { NegotiationTranscript } from '@hold/db'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { OfferLadder } from './offer-ladder'

const at = new Date('2026-11-03T12:31:34Z')
const move = (sequence: number, side: 'shop' | 'renter', kind: 'offer' | 'accept' | 'pass', totalCents: number | null, actor: string) => ({
  sequence, side, kind, lines: [], totalCents, passReason: kind === 'pass' ? ('chose' as const) : null, actor, model: actor === 'referee' ? null : 'claude-opus-4-6', createdAt: at, fingerprint: String(sequence).repeat(64),
})
const transcript: NegotiationTranscript = {
  id: 'negotiation-1', kind: 'negotiation', state: 'agreed', endedReason: null, currency: 'EUR', claimTotalCents: 50_00, agreedCents: 25_00, deadline: at, roundLimit: 6, shopConfirmedAt: null, renterConfirmedAt: null, simulated: false, sample: true, chainVerified: true,
  lines: [], wearClauses: [],
  moves: [move(1, 'shop', 'offer', 50_00, 'referee'), move(2, 'renter', 'offer', 15_00, 'renter_advocate'), move(3, 'shop', 'offer', 40_00, 'shop_advocate'), move(4, 'renter', 'offer', 25_00, 'renter_advocate'), move(5, 'shop', 'accept', null, 'shop_advocate')],
}

describe('the offer ladder', () => {
  it('sets every offer on one scale from nothing to the claim, so the gap can be seen closing', () => {
    renderWithIntl(<OfferLadder transcript={transcript} caption="A run" />)
    const offers = within(screen.getByRole('figure', { name: 'A run' })).getAllByRole('listitem')
    expect(offers.map((offer) => offer.textContent)).toEqual([
      expect.stringMatching(/The shop's advocate.*Opens with the claim.*€50\.00/),
      expect.stringMatching(/The renter's advocate.*Offers.*€15\.00/),
      expect.stringMatching(/The shop's advocate.*Offers.*€40\.00/),
      expect.stringMatching(/The renter's advocate.*Offers.*€25\.00/),
      expect.stringMatching(/The shop's advocate.*Accepts.*€25\.00/),
    ])
  })

  it('ends on the agreement, and says nothing is taken until both people confirm', () => {
    renderWithIntl(<OfferLadder transcript={transcript} caption="A run" />)
    expect(screen.getByText('Agreed: €25.00')).toBeInTheDocument()
    expect(screen.getByText('Of a claim of €50.00. Nothing is taken until both people confirm.')).toBeInTheDocument()
  })

  it('ends on the owner deciding when the advocates did not agree', () => {
    renderWithIntl(<OfferLadder transcript={{ ...transcript, state: 'escalated', agreedCents: null, endedReason: 'pass', moves: [...transcript.moves.slice(0, 4), move(5, 'shop', 'pass', null, 'shop_advocate')] }} caption="A run" />)
    expect(screen.getByText('No agreement: the owner decides, with the transcript.')).toBeInTheDocument()
  })
})
