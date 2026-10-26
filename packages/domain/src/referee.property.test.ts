import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { checkSettlementLimits, shopFloorCents } from './agent-gateway.ts'
import type { Mandate } from './agent-gateway.ts'
import { settle } from './claim-arithmetic.ts'
import { money } from './money.ts'
import { GROUNDS } from './negotiation.ts'
import type { LineFacts } from './negotiation-grounds.ts'
import { judgeMove, openTable, openingOffer, replayTable } from './referee.ts'
import type { Judgment, OfferLine, ProposedMove, RefereeContext, Table } from './referee.ts'

// Extensions.md section 9.15 and X4.2: for any two mandates and any sequence of moves, hostile ones included.

const opened = new Date('2026-11-01T10:00:00Z')
const at = (minutes: number) => new Date(opened.getTime() + minutes * 60_000)
const EVIDENCE = ['mark-1', 'wear-1', 'photo-1', 'not-this-rental'] as const

const lineFacts = fc.record({
  publishedCents: fc.integer({ min: 0, max: 300_00 }),
  knownMark: fc.boolean(),
  uncertain: fc.boolean(),
  bothLooksConfirmed: fc.boolean(),
})

const scenario = fc.record({
  lines: fc.array(lineFacts, { minLength: 1, maxLength: 4 }),
  goodwillAllowed: fc.boolean(),
  share: fc.integer({ min: 0, max: 100 }),
  largestClaimCents: fc.integer({ min: 0, max: 1500_00 }),
  rounds: fc.integer({ min: 1, max: 10 }),
  highestTotalCents: fc.integer({ min: 0, max: 1500_00 }),
  reservedCents: fc.integer({ min: 0, max: 1500_00 }),
  // Minutes after opening at which each mandate ends or is revoked, or never within the run.
  shopEnds: fc.option(fc.integer({ min: 0, max: 200 })),
  renterEnds: fc.option(fc.integer({ min: 0, max: 200 })),
  shopRevoked: fc.option(fc.integer({ min: 0, max: 200 })),
  renterRevoked: fc.option(fc.integer({ min: 0, max: 200 })),
  deadline: fc.integer({ min: 1, max: 400 }),
})
type Scenario = typeof scenario extends fc.Arbitrary<infer Value> ? Value : never

function contextOf(value: Scenario): RefereeContext {
  const lines: LineFacts[] = value.lines.map((line, index) => ({ lineId: `line-${String(index)}`, publishedCents: line.publishedCents, knownMarks: line.knownMark ? ['mark-1'] : [], uncertain: line.uncertain, bothLooksConfirmed: line.bothLooksConfirmed, wearClauses: ['wear-1'] }))
  const window = (ends: number | null, revoked: number | null) => ({ validFrom: at(-60), validUntil: ends === null ? at(10_000) : at(ends), revokedAt: revoked === null ? null : at(revoked) })
  const shop: Mandate = { id: 'shop', kind: 'settlement_shop', grantedTo: 'shop_advocate', ...window(value.shopEnds, value.shopRevoked), limits: { currency: 'EUR', lowestSharePercent: value.share, largestClaimCents: value.largestClaimCents, rounds: value.rounds, evidenceRequired: !value.goodwillAllowed, finalTap: true } }
  const renter: Mandate = { id: 'renter', kind: 'settlement_renter', grantedTo: 'renter_advocate', ...window(value.renterEnds, value.renterRevoked), limits: { currency: 'EUR', highestTotalCents: value.highestTotalCents, finalTap: true } }
  return { currency: 'EUR', lines, claim: { renterPhotoIds: ['photo-1'], goodwillAllowed: value.goodwillAllowed }, roundLimit: value.rounds, deadline: at(value.deadline), mandates: { shop, renter } }
}

// Anything a hostile or broken advocate might send: any side, any amount, part cents, missing, extra or repeated lines,
// any ground with any evidence.
const hostileLine = fc.record({
  lineId: fc.constantFrom('line-0', 'line-1', 'line-2', 'line-3', 'line-9'),
  cents: fc.oneof(fc.integer({ min: -100, max: 400_00 }), fc.double({ min: -10, max: 400_00, noNaN: true })),
  ground: fc.option(fc.constantFrom(...GROUNDS)),
  evidence: fc.array(fc.constantFrom(...EVIDENCE), { maxLength: 7 }),
})
const hostileMove: fc.Arbitrary<ProposedMove> = fc.oneof(
  fc.record({ side: fc.constantFrom('shop' as const, 'renter' as const), kind: fc.constant('offer' as const), lines: fc.array(hostileLine, { maxLength: 5 }) }),
  fc.record({ side: fc.constantFrom('shop' as const, 'renter' as const), kind: fc.constant('accept' as const) }),
  fc.record({ side: fc.constantFrom('shop' as const, 'renter' as const), kind: fc.constant('pass' as const), reason: fc.constant('chose' as const) }),
)

// A move made in turn by an advocate that tries to settle: each line it can lower on a ground that holds goes to a
// share of its price, the rest stay; or it accepts.
type Intent = { readonly kind: 'hostile'; readonly move: ProposedMove } | { readonly kind: 'settling'; readonly share: number; readonly accept: boolean }
const intent: fc.Arbitrary<Intent> = fc.oneof(
  hostileMove.map((move) => ({ kind: 'hostile' as const, move })),
  fc.record({ kind: fc.constant('settling' as const), share: fc.double({ min: 0, max: 1, noNaN: true }), accept: fc.boolean() }),
)
function settlingMove(context: RefereeContext, table: Table, share: number, accept: boolean): ProposedMove {
  const side = table.turn
  if (accept) return { side, kind: 'accept' }
  const lines = context.lines.map((line): OfferLine => {
    const ground = line.knownMarks.length > 0 ? { ground: 'known_mark' as const, evidence: line.knownMarks } : line.uncertain ? { ground: 'uncertain_evidence' as const, evidence: [] } : { ground: 'ordinary_wear' as const, evidence: ['wear-1'] }
    return { lineId: line.lineId, cents: Math.floor(line.publishedCents * share), ...ground }
  })
  return { side, kind: 'offer', lines }
}

function run(context: RefereeContext, intents: readonly Intent[], steps: readonly number[]) {
  const opening = judgeMove(context, openTable(opened), openingOffer(context), at(0))
  let table = opening.table
  const judged: { readonly judgment: Judgment; readonly now: Date; readonly before: Table; readonly move: ProposedMove }[] = [{ judgment: opening, now: at(0), before: openTable(opened), move: openingOffer(context) }]
  let minute = 0
  intents.forEach((each, index) => {
    minute += steps[index % steps.length] ?? 1
    const now = at(minute)
    const move = each.kind === 'hostile' ? each.move : settlingMove(context, table, each.share, each.accept)
    const judgment = judgeMove(context, table, move, now)
    judged.push({ judgment, now, before: table, move })
    table = judgment.table
  })
  return { table, judged }
}

const live = (mandate: Mandate, now: Date) => (mandate.revokedAt === null || mandate.revokedAt > now) && mandate.validFrom <= now && now < mandate.validUntil

describe('the referee, for any two mandates and any moves', () => {
  const parameters = { numRuns: 400 }
  const property = (check: (context: RefereeContext, value: Scenario, outcome: ReturnType<typeof run>) => void) => {
    fc.assert(fc.property(scenario, fc.array(intent, { maxLength: 30 }), fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 1, maxLength: 5 }), (value, intents, steps) => {
      const context = contextOf(value)
      check(context, value, run(context, intents, steps))
    }), parameters)
  }

  it('never settles above the renter’s highest total, nor below the shop’s lowest share, nor on a claim above its largest', () => {
    property((context, value, { table }) => {
      if (table.agreed === null) return
      const claimTotal = context.lines.reduce((sum, line) => sum + line.publishedCents, 0)
      expect(table.agreed.totalCents).toBeLessThanOrEqual(value.highestTotalCents)
      expect(table.agreed.totalCents).toBeGreaterThanOrEqual(shopFloorCents(claimTotal, value.share))
      expect(claimTotal).toBeLessThanOrEqual(value.largestClaimCents)
    })
  })

  it('never puts a line above its published price, below zero or in part cents, and the total is the sum of the lines', () => {
    property((context, _value, { table }) => {
      for (const offer of [table.last.shop, table.last.renter, table.agreed]) {
        if (offer === null) continue
        expect(offer.lines.map((line) => line.lineId).sort()).toEqual(context.lines.map((line) => line.lineId).sort())
        for (const line of offer.lines) {
          const published = context.lines.find((each) => each.lineId === line.lineId)?.publishedCents ?? -1
          expect(Number.isSafeInteger(line.cents) && line.cents >= 0 && line.cents <= published).toBe(true)
        }
        expect(offer.totalCents).toBe(offer.lines.reduce((sum, line) => sum + line.cents, 0))
      }
    })
  })

  it('never captures above the reserved amount', () => {
    property((_context, value, { table }) => {
      if (table.agreed === null) return
      const plan = settle(money(table.agreed.totalCents, 'EUR'), money(value.reservedCents, 'EUR'))
      expect(plan.capture.cents).toBeLessThanOrEqual(value.reservedCents)
      expect(plan.capture.cents + plan.release.cents).toBe(value.reservedCents)
    })
  })

  it('settles only while both mandates are live at the moment of agreement', () => {
    property((context, _value, { judged }) => {
      for (const { judgment, now, before } of judged) {
        if (judgment.table.status === 'agreed' && before.status === 'open') {
          expect(live(context.mandates.shop, now) && live(context.mandates.renter, now)).toBe(true)
          expect(now < context.deadline).toBe(true)
        }
      }
    })
  })

  it('keeps each side within its offers, and moves no ended negotiation again', () => {
    property((context, _value, { judged }) => {
      for (const { judgment, before } of judged) {
        expect(judgment.table.offers.shop).toBeLessThanOrEqual(context.roundLimit)
        expect(judgment.table.offers.renter).toBeLessThanOrEqual(context.roundLimit)
        if (before.status !== 'open') expect(judgment).toEqual({ outcome: 'refused', table: before, reason: 'not_open' })
      }
    })
  })

  it('ends within the round limit when each side moves in its turn, whatever it sends', () => {
    fc.assert(fc.property(scenario, fc.array(intent, { minLength: 60, maxLength: 60 }), (value, intents) => {
      // Mandates that stay live and a deadline far away, so only the round limit can end it.
      const base = contextOf(value)
      const lasting = (mandate: Mandate): Mandate => ({ ...mandate, revokedAt: null, validUntil: at(100_000) })
      const context = { ...base, deadline: at(100_000), mandates: { shop: lasting(base.mandates.shop), renter: lasting(base.mandates.renter) } }
      let table = judgeMove(context, openTable(opened), openingOffer(context), at(0)).table
      let judgments = 1
      for (const [index, each] of intents.entries()) {
        if (table.status !== 'open') break
        const move = each.kind === 'hostile' ? { ...each.move, side: table.turn } : settlingMove(context, table, each.share, each.accept)
        table = judgeMove(context, table, move, at(index + 1)).table
        judgments += 1
      }
      // Each turn takes at most two judgments: a refusal, then a second refusal or a move the referee accepts. The shop
      // and the renter have at most the round limit of offers each, and the turn after the last one must end it.
      expect(table.status).not.toBe('open')
      expect(judgments).toBeLessThanOrEqual(2 * (2 * context.roundLimit + 1))
    }), parameters)
  })

  it('rebuilds the same table from the accepted moves alone, as the database stores them', () => {
    property((context, _value, { table, judged }) => {
      if (table.endedReason !== null && table.endedReason !== 'pass') return
      const accepted = judged.filter(({ judgment }) => judgment.outcome === 'accepted').map(({ move, now }) => ({ move, at: now }))
      expect(replayTable(opened, accepted, table.refusals)).toEqual(table)
    })
  })

  it('agrees sometimes, so the properties above are not empty', () => {
    let agreed = 0
    fc.assert(fc.property(scenario, fc.array(intent, { maxLength: 30 }), (value, intents) => {
      const context = { ...contextOf({ ...value, shopRevoked: null, renterRevoked: null, shopEnds: null, renterEnds: null, deadline: 400, largestClaimCents: 1500_00 }) }
      if (run(context, intents, [1]).table.status === 'agreed') agreed += 1
    }), { numRuns: 400 })
    expect(agreed).toBeGreaterThan(10)
  })

  it('reads only typed mandates', () => {
    expect(checkSettlementLimits('settlement_shop', contextOf(fc.sample(scenario, 1)[0] as Scenario).mandates.shop.limits).ok).toBe(true)
  })
})
