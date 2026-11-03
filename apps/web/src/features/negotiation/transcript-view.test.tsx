import type { NegotiationTranscript } from '@hold/db'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import fr from '../../../messages/fr.json'
import { TranscriptView } from './transcript-view'

const at = new Date('2026-11-01T10:00:00Z')
const transcript: NegotiationTranscript = {
  id: 'negotiation-1', kind: 'negotiation', state: 'agreed', endedReason: null, currency: 'EUR', claimTotalCents: 50_00, agreedCents: 28_00, deadline: at, roundLimit: 6, shopConfirmedAt: null, renterConfirmedAt: null, simulated: true, sample: false, chainVerified: true,
  lines: [{ lineId: 'scratch', publishedCents: 35_00, description: 'Scratch' }, { lineId: 'dent', publishedCents: 15_00, description: 'Dent' }],
  wearClauses: [{ id: 'wear-1', text: 'Scuffs under 2 cm are wear.' }],
  moves: [
    { sequence: 1, side: 'shop', kind: 'offer', lines: [{ lineId: 'scratch', cents: 35_00, ground: 'evidence_stands', evidence: [] }, { lineId: 'dent', cents: 15_00, ground: null, evidence: [] }], totalCents: 50_00, passReason: null, actor: 'referee', model: null, createdAt: at, fingerprint: 'a'.repeat(64) },
    { sequence: 2, side: 'renter', kind: 'offer', lines: [{ lineId: 'scratch', cents: 28_00, ground: 'uncertain_evidence', evidence: [] }, { lineId: 'dent', cents: 0, ground: 'ordinary_wear', evidence: ['wear-1'] }], totalCents: 28_00, passReason: null, actor: 'renter_advocate', model: 'simulated', createdAt: at, fingerprint: 'b'.repeat(64) },
    { sequence: 3, side: 'shop', kind: 'accept', lines: [], totalCents: null, passReason: null, actor: 'shop_advocate', model: 'simulated', createdAt: at, fingerprint: 'c'.repeat(64) },
  ],
}

describe('the transcript both people read', () => {
  it('shows each move, each lowered line against its price, and the ground in plain words', () => {
    renderWithIntl(<TranscriptView transcript={transcript} />)
    expect(screen.getByRole('heading', { name: 'What the advocates said' })).toBeInTheDocument()
    expect(screen.getByText('Opened with the claim as presented: €50.00')).toBeInTheDocument()
    expect(screen.getByText('Offered €28.00')).toBeInTheDocument()
    expect(screen.getByText('Scratch: €28.00 instead of €35.00')).toBeInTheDocument()
    expect(screen.getByText('The photographs do not settle it')).toBeInTheDocument()
    expect(screen.getByText('The wear policy covers it: Scuffs under 2 cm are wear.')).toBeInTheDocument()
    expect(screen.getByText("Accepted the other side's last offer")).toBeInTheDocument()
    expect(screen.getByText('The advocates agreed on €28.00. Nothing is charged until each person confirms.')).toBeInTheDocument()
    expect(screen.getByText(/no move was changed, removed or reordered/)).toBeInTheDocument()
  })

  it('says when the advocates were simulated, and why a negotiation went to the owner', () => {
    renderWithIntl(<TranscriptView transcript={{ ...transcript, state: 'escalated', endedReason: 'mandate_ended', agreedCents: null }} />)
    expect(screen.getByText(/Simulated advocates/)).toBeInTheDocument()
    expect(screen.getByText('An advocate was stopped, or its limits ended.')).toBeInTheDocument()
  })

  it('says a sample’s renter and limit were made up, and that Claude argued both sides, when the advocates were real', () => {
    const live = { ...transcript, simulated: false, sample: true, moves: transcript.moves.map((move) => ({ ...move, model: move.model === null ? null : 'us.anthropic.claude-opus-4-6-v1' })) }
    renderWithIntl(<TranscriptView transcript={live} />)
    expect(screen.getByText('Sample claim, live advocates')).toBeInTheDocument()
    expect(screen.queryByText(/Simulated advocates/)).not.toBeInTheDocument()
  })

  it('reads in the renter’s language', () => {
    renderWithIntl(<TranscriptView transcript={transcript} />, { locale: 'fr', messages: fr })
    expect(screen.getByRole('heading', { name: 'Les échanges des représentants' })).toBeInTheDocument()
    expect(screen.getByText('Les photos ne permettent pas de trancher')).toBeInTheDocument()
  })
})
