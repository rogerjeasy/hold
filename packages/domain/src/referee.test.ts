import { describe, expect, it } from 'vitest'
import type { Mandate } from './agent-gateway.ts'
import { lineFacts } from './negotiation-grounds.ts'
import { judgeMove, openTable, openingOffer, replayTable } from './referee.ts'
import type { OfferLine, ProposedMove, RefereeContext, Table } from './referee.ts'

const opened = new Date('2026-11-01T10:00:00Z')
const minutes = (count: number) => new Date(opened.getTime() + count * 60_000)
const region = { x: 0.4, y: 0.4, width: 0.1, height: 0.1 }
// Line one: a scratch the second look doubted. Line two: a dent beside a mark that was there before this rental.
const lines = [
  lineFacts({ lineId: 'scratch', publishedCents: 35_00, finding: { view: 'left-side', region, confidence: 0.8, secondLookConfirmed: true, alignment: 0.99 }, marks: [], wearRules: 'Scuffs are wear.' }),
  lineFacts({ lineId: 'dent', publishedCents: 15_00, finding: { view: 'right-side', region, confidence: 0.97, secondLookConfirmed: true, alignment: 0.99 }, marks: [{ id: 'mark-1', view: 'right-side', region, seenBeforeRental: true }], wearRules: 'Scuffs are wear.' }),
]
const mandate = (kind: 'settlement_shop' | 'settlement_renter', limits: Mandate['limits']): Mandate => ({ id: kind, kind, grantedTo: kind, validFrom: new Date('2026-10-01'), validUntil: new Date('2026-12-01'), revokedAt: null, limits })
const context: RefereeContext = {
  currency: 'EUR',
  lines,
  claim: { renterPhotoIds: ['photo-1'], goodwillAllowed: false },
  roundLimit: 6,
  deadline: new Date('2026-11-05T10:00:00Z'),
  mandates: {
    shop: mandate('settlement_shop', { currency: 'EUR', lowestSharePercent: 50, largestClaimCents: 200_00, rounds: 6, evidenceRequired: true, finalTap: true }),
    renter: mandate('settlement_renter', { currency: 'EUR', highestTotalCents: 30_00, finalTap: true }),
  },
}
const line = (lineId: string, cents: number, ground: OfferLine['ground'] = null, evidence: readonly string[] = []): OfferLine => ({ lineId, cents, ground, evidence })
const offer = (side: 'shop' | 'renter', offered: readonly OfferLine[]): ProposedMove => ({ side, kind: 'offer', lines: offered })

function play(moves: readonly ProposedMove[], start: Table = openTable(opened)) {
  let table = start
  const results = moves.map((move, index) => {
    const judged = judgeMove(context, table, move, minutes(index + 1))
    table = judged.table
    return judged
  })
  return { table, results }
}

describe('the referee, in the walk-through of section 9.8', () => {
  const walk = [
    openingOffer(context),
    offer('renter', [line('scratch', 20_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])]),
    offer('shop', [line('scratch', 35_00), line('dent', 0, 'known_mark', ['mark-1'])]),
    offer('renter', [line('scratch', 28_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])]),
    { side: 'shop', kind: 'accept' } as const,
  ]

  it('opens with the claim as presented, the evidence standing only where both looks confirmed it and no mark is near', () => {
    expect(openingOffer(context)).toEqual({ side: 'shop', kind: 'offer', lines: [line('scratch', 35_00), line('dent', 15_00)] })
  })

  it('agrees at 28.00 after four offers and an acceptance, each line inside its published price', () => {
    const { table, results } = play(walk)
    expect(results.map((result) => result.outcome)).toEqual(['accepted', 'accepted', 'accepted', 'accepted', 'accepted'])
    expect(table).toMatchObject({ status: 'agreed', agreed: { totalCents: 28_00, lines: [line('scratch', 28_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])] }, offers: { shop: 2, renter: 2 } })
  })

  it('rebuilds the same table from the stored moves alone', () => {
    const { table } = play(walk)
    expect(replayTable(context, opened, walk.map((move, index) => ({ move, at: minutes(index + 1) })))).toEqual(table)
  })
})

describe('the referee refuses', () => {
  const afterOpening = play([openingOffer(context)]).table

  it('a lowered line whose ground fails its check, and tells only that side why (X4.5)', () => {
    const judged = judgeMove(context, afterOpening, offer('renter', [line('scratch', 35_00), line('dent', 0, 'known_mark', ['mark-9'])]), minutes(2))
    expect(judged).toMatchObject({ outcome: 'refused', reason: 'ground_check_failed', table: { refusals: { renter: 1, shop: 0 }, turn: 'renter', last: { renter: null } } })
    expect(judgeMove(context, afterOpening, offer('renter', [line('scratch', 30_00), line('dent', 0)]), minutes(2))).toMatchObject({ outcome: 'refused', reason: 'ground_missing' })
    expect(judgeMove(context, afterOpening, offer('renter', [line('scratch', 30_00, 'evidence_stands'), line('dent', 0, 'known_mark', ['mark-1'])]), minutes(2))).toMatchObject({ outcome: 'refused', reason: 'ground_not_for_side' })
  })

  it('a line above its published price, below zero, in part cents, missing, repeated or not on the claim', () => {
    for (const offered of [
      [line('scratch', 35_01), line('dent', 0, 'known_mark', ['mark-1'])],
      [line('scratch', -1, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])],
      [line('scratch', 10.5, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])],
    ]) expect(judgeMove(context, afterOpening, offer('renter', offered), minutes(2))).toMatchObject({ outcome: 'refused', reason: 'line_out_of_range' })
    for (const offered of [[line('scratch', 20_00, 'uncertain_evidence')], [line('scratch', 20_00, 'uncertain_evidence'), line('scratch', 20_00, 'uncertain_evidence')], [line('scratch', 20_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1']), line('wheel', 0, 'goodwill')]]) {
      expect(judgeMove(context, afterOpening, offer('renter', offered), minutes(2))).toMatchObject({ outcome: 'refused', reason: 'lines_mismatch' })
    }
  })

  it('an offer outside its own side’s mandate', () => {
    const renterOffered = play([openingOffer(context), offer('renter', [line('scratch', 10_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])])]).table
    // The shop may not go below half of 50.00.
    expect(judgeMove(context, renterOffered, offer('shop', [line('scratch', 24_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])]), minutes(3))).toMatchObject({ outcome: 'refused', reason: 'below_lowest_share' })
    // The renter may not offer more than 30.00, nor accept more.
    expect(judgeMove(context, afterOpening, offer('renter', [line('scratch', 35_00), line('dent', 0, 'known_mark', ['mark-1'])]), minutes(2))).toMatchObject({ outcome: 'refused', reason: 'above_highest_total' })
    expect(judgeMove(context, afterOpening, { side: 'renter', kind: 'accept' }, minutes(2))).toMatchObject({ outcome: 'refused', reason: 'above_highest_total' })
  })

  it('a shop offer that rises, a renter offer that falls, and an offer past the other side’s instead of accepting it', () => {
    const { table } = play([openingOffer(context), offer('renter', [line('scratch', 20_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])]), offer('shop', [line('scratch', 30_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])])])
    expect(judgeMove(context, table, offer('renter', [line('scratch', 19_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])]), minutes(5))).toMatchObject({ outcome: 'refused', reason: 'offer_fell' })
    expect(judgeMove(context, table, offer('renter', [line('scratch', 30_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])]), minutes(5))).toMatchObject({ outcome: 'refused', reason: 'accept_instead' })
    const renterAgain = judgeMove(context, table, offer('renter', [line('scratch', 25_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])]), minutes(5)).table
    expect(judgeMove(context, renterAgain, offer('shop', [line('scratch', 31_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])]), minutes(6))).toMatchObject({ outcome: 'refused', reason: 'offer_rose' })
  })

  it('a move out of turn, and anything once the negotiation has ended, without counting it against the side', () => {
    expect(judgeMove(context, openTable(opened), offer('renter', [line('scratch', 20_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])]), minutes(1))).toMatchObject({ outcome: 'refused', reason: 'not_your_turn', table: { refusals: { renter: 0 } } })
    const passed = judgeMove(context, afterOpening, { side: 'renter', kind: 'pass', reason: 'chose' }, minutes(2)).table
    expect(judgeMove(context, passed, { side: 'shop', kind: 'accept' }, minutes(3))).toMatchObject({ outcome: 'refused', reason: 'not_open' })
  })

  it('an offer once its side has made as many as the round limit allows', () => {
    const short = { ...context, roundLimit: 1 }
    let table = judgeMove(short, openTable(opened), openingOffer(short), minutes(1)).table
    table = judgeMove(short, table, offer('renter', [line('scratch', 20_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])]), minutes(2)).table
    expect(judgeMove(short, table, offer('shop', [line('scratch', 30_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])]), minutes(3))).toMatchObject({ outcome: 'refused', reason: 'no_offers_left' })
  })
})

describe('the referee ends the negotiation and sends the claim to the owner', () => {
  const afterOpening = play([openingOffer(context)]).table
  const fair = offer('renter', [line('scratch', 20_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])])

  it('on a pass', () => {
    expect(judgeMove(context, afterOpening, { side: 'renter', kind: 'pass', reason: 'chose' }, minutes(2))).toMatchObject({ outcome: 'accepted', table: { status: 'escalated', endedReason: 'pass' } })
  })

  it('after two refusals in a row, as a pass', () => {
    const bad = offer('renter', [line('scratch', 35_00), line('dent', 0, 'goodwill')])
    const first = judgeMove(context, afterOpening, bad, minutes(2))
    expect(first).toMatchObject({ outcome: 'refused', table: { status: 'open' } })
    expect(judgeMove(context, first.table, bad, minutes(3))).toMatchObject({ outcome: 'refused', table: { status: 'escalated', endedReason: 'refused_twice' } })
  })

  it('when a side takes longer than its time, or the deadline passes', () => {
    expect(judgeMove(context, afterOpening, fair, minutes(12))).toMatchObject({ outcome: 'ended', reason: 'time_limit', table: { status: 'escalated' } })
    expect(judgeMove(context, afterOpening, fair, new Date('2026-11-05T10:00:00Z'))).toMatchObject({ outcome: 'ended', reason: 'deadline' })
  })

  it('when either mandate was revoked or ended, even at the moment of agreement (X4.6)', () => {
    const renterOffered = judgeMove(context, afterOpening, offer('renter', [line('scratch', 25_00, 'uncertain_evidence'), line('dent', 0, 'known_mark', ['mark-1'])]), minutes(2)).table
    const revoked = { ...context, mandates: { ...context.mandates, renter: { ...context.mandates.renter, revokedAt: minutes(2) } } }
    expect(judgeMove(revoked, renterOffered, { side: 'shop', kind: 'accept' }, minutes(3))).toMatchObject({ outcome: 'ended', reason: 'mandate_ended', table: { status: 'escalated', agreed: null } })
    const lapsed = { ...context, mandates: { ...context.mandates, shop: { ...context.mandates.shop, validUntil: minutes(3) } } }
    expect(judgeMove(lapsed, renterOffered, { side: 'shop', kind: 'accept' }, minutes(3))).toMatchObject({ outcome: 'ended', reason: 'mandate_ended' })
  })
})
