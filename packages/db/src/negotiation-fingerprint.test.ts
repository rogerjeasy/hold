import { describe, expect, it } from 'vitest'
import { chainMoves, moveFingerprint, verifyTranscript } from './negotiation-fingerprint.ts'

const at = new Date('2026-11-01T10:00:00Z')
const opening = { sequence: 1, side: 'shop' as const, kind: 'offer' as const, lines: [{ lineId: 'line-1', cents: 35_00, ground: 'evidence_stands' as const, evidence: [] }], totalCents: 35_00, passReason: null, actor: 'referee', createdAt: at }
const reply = { sequence: 2, side: 'renter' as const, kind: 'offer' as const, lines: [{ lineId: 'line-1', cents: 20_00, ground: 'uncertain_evidence' as const, evidence: [] }], totalCents: 20_00, passReason: null, actor: 'renter_advocate', createdAt: new Date(at.getTime() + 60_000) }

describe('the transcript’s chain of fingerprints', () => {
  it('names each move with the fingerprint of the one before it, so the same moves always give the same chain', () => {
    const chained = chainMoves([opening, reply])
    expect(chained[0]?.previousFingerprint).toBeNull()
    expect(chained[1]?.previousFingerprint).toBe(chained[0]?.fingerprint)
    expect(chained[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(chainMoves([opening, reply])).toEqual(chained)
    expect(verifyTranscript(chained)).toEqual({ ok: true })
  })

  it('breaks when a move is changed, removed or moved', () => {
    const chained = chainMoves([opening, reply])
    const [first, second] = chained
    if (first === undefined || second === undefined) throw new Error('Two moves were chained.')
    expect(verifyTranscript([first, { ...second, totalCents: 19_00 }])).toEqual({ ok: false, sequence: 2 })
    expect(verifyTranscript([first, { ...second, actor: 'shop_advocate' }])).toEqual({ ok: false, sequence: 2 })
    expect(verifyTranscript([second])).toEqual({ ok: false, sequence: 2 })
    expect(verifyTranscript([second, first])).toEqual({ ok: false, sequence: 2 })
  })

  it('depends on the previous fingerprint as well as the move', () => {
    expect(moveFingerprint(null, reply)).not.toBe(moveFingerprint('a'.repeat(64), reply))
  })
})
