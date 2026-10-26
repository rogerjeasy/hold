import { withinMandate } from './agent-gateway.ts'
import type { Mandate, MandateCheck } from './agent-gateway.ts'
import { NEGOTIATION_LIMITS, otherSide } from './negotiation.ts'
import type { EscalationReason, Ground, NegotiationSide, PassReason } from './negotiation.ts'
import { checkGround } from './negotiation-grounds.ts'
import type { ClaimFacts, GroundRefusal, LineFacts } from './negotiation-grounds.ts'

// The referee (extensions.md section 9.7). Plain code, not a model: it accepts or refuses each move, and it is the only
// thing that decides whether a move is allowed. It never reads an advocate's words.

export type OfferLine = { readonly lineId: string; readonly cents: number; readonly ground: Ground | null; readonly evidence: readonly string[] }
export type Offer = { readonly lines: readonly OfferLine[]; readonly totalCents: number }
export type ProposedMove =
  | { readonly side: NegotiationSide; readonly kind: 'offer'; readonly lines: readonly OfferLine[] }
  | { readonly side: NegotiationSide; readonly kind: 'accept' }
  | { readonly side: NegotiationSide; readonly kind: 'pass'; readonly reason: PassReason }

export type RefereeContext = {
  readonly currency: string
  readonly lines: readonly LineFacts[]
  readonly claim: ClaimFacts
  // The most offers each side may make.
  readonly roundLimit: number
  readonly deadline: Date
  readonly mandates: { readonly shop: Mandate; readonly renter: Mandate }
}

// The state of play, rebuilt from the stored moves and the refusals counted beside them.
export type Table = {
  readonly status: 'open' | 'agreed' | 'escalated'
  readonly turn: NegotiationSide
  readonly offers: Readonly<Record<NegotiationSide, number>>
  readonly last: Readonly<Record<NegotiationSide, Offer | null>>
  readonly lastMoveAt: Date
  readonly refusals: Readonly<Record<NegotiationSide, number>>
  readonly agreed: Offer | null
  readonly endedReason: EscalationReason | null
}

export type RefusalReason =
  | 'not_open' | 'not_your_turn' | 'nothing_to_accept' | 'no_offers_left' | 'lines_mismatch' | 'line_out_of_range'
  | 'ground_missing' | 'ground_does_not_fit' | 'too_much_evidence' | GroundRefusal
  | 'offer_rose' | 'offer_fell' | 'accept_instead'
  | Exclude<Extract<MandateCheck, { readonly ok: false }>['reason'], 'not_yet_valid' | 'expired' | 'revoked'>

export type Judgment =
  | { readonly outcome: 'accepted'; readonly table: Table; readonly totalCents: number | null }
  // Returned to the side that made it, and to nobody else.
  | { readonly outcome: 'refused'; readonly table: Table; readonly reason: RefusalReason }
  // The negotiation ended before the move was looked at.
  | { readonly outcome: 'ended'; readonly table: Table; readonly reason: EscalationReason }

export function openTable(openedAt: Date): Table {
  return { status: 'open', turn: 'shop', offers: { shop: 0, renter: 0 }, last: { shop: null, renter: null }, lastMoveAt: openedAt, refusals: { shop: 0, renter: 0 }, agreed: null, endedReason: null }
}

// The shop opens with the claim as presented, citing evidence_stands on each line where that holds.
export function openingOffer(context: RefereeContext): ProposedMove {
  return { side: 'shop', kind: 'offer', lines: context.lines.map((line) => ({ lineId: line.lineId, cents: line.publishedCents, ground: checkGround({ side: 'shop', ground: 'evidence_stands', evidence: [] }, line, context.claim).ok ? 'evidence_stands' : null, evidence: [] })) }
}

export function escalate(table: Table, reason: EscalationReason): Table {
  return { ...table, status: 'escalated', endedReason: reason }
}

const claimTotal = (context: RefereeContext) => context.lines.reduce((sum, line) => sum + line.publishedCents, 0)
const refused = (table: Table, reason: RefusalReason): Judgment => ({ outcome: 'refused', table, reason })

// What ends a negotiation whatever the move: its deadline, a side's time, a mandate that ended or was revoked.
function ending(context: RefereeContext, table: Table, now: Date): EscalationReason | null {
  if (now >= context.deadline) return 'deadline'
  if ([context.mandates.shop, context.mandates.renter].some((mandate) => (mandate.revokedAt !== null && mandate.revokedAt <= now) || now < mandate.validFrom || now >= mandate.validUntil)) return 'mandate_ended'
  if (now.getTime() - table.lastMoveAt.getTime() > NEGOTIATION_LIMITS.turnMilliseconds) return 'time_limit'
  return null
}

function checkLines(context: RefereeContext, side: NegotiationSide, lines: readonly OfferLine[]): RefusalReason | null {
  const ids = lines.map((line) => line.lineId)
  if (lines.length !== context.lines.length || new Set(ids).size !== ids.length || !context.lines.every((facts) => ids.includes(facts.lineId))) return 'lines_mismatch'
  for (const line of lines) {
    const facts = context.lines.find((each) => each.lineId === line.lineId)
    if (facts === undefined) return 'lines_mismatch'
    if (!Number.isSafeInteger(line.cents) || line.cents < 0 || line.cents > facts.publishedCents) return 'line_out_of_range'
    if (line.evidence.length > NEGOTIATION_LIMITS.evidencePerLine) return 'too_much_evidence'
    const lowered = line.cents < facts.publishedCents
    if (lowered && line.ground === null) return 'ground_missing'
    if (line.ground === null) continue
    // evidence_stands keeps a line at its price; every other ground lowers it.
    if (lowered === (line.ground === 'evidence_stands')) return line.ground === 'evidence_stands' && side !== 'shop' ? 'ground_not_for_side' : 'ground_does_not_fit'
    const ground = checkGround({ side, ground: line.ground, evidence: line.evidence }, facts, context.claim)
    if (!ground.ok) return ground.reason
  }
  return null
}

function mandateRefusal(context: RefereeContext, side: NegotiationSide, kind: 'settlement_offer' | 'settlement_accept', totalCents: number, now: Date): RefusalReason | null {
  const checked = withinMandate({ kind, side, totalCents, claimTotalCents: claimTotal(context), currency: context.currency }, context.mandates[side], now)
  if (checked.ok) return null
  return checked.reason === 'not_yet_valid' || checked.reason === 'expired' || checked.reason === 'revoked' ? 'not_covered' : checked.reason
}

function judgeOffer(context: RefereeContext, table: Table, side: NegotiationSide, lines: readonly OfferLine[], now: Date): RefusalReason | Offer {
  if (table.offers[side] >= context.roundLimit) return 'no_offers_left'
  const problem = checkLines(context, side, lines)
  if (problem !== null) return problem
  const totalCents = lines.reduce((sum, line) => sum + line.cents, 0)
  const own = table.last[side]
  // The shop's offers never rise and the renter's never fall, so the gap only closes and the negotiation ends.
  if (own !== null && side === 'shop' && totalCents > own.totalCents) return 'offer_rose'
  if (own !== null && side === 'renter' && totalCents < own.totalCents) return 'offer_fell'
  const theirs = table.last[otherSide(side)]
  if (theirs !== null && (side === 'shop' ? totalCents <= theirs.totalCents : totalCents >= theirs.totalCents)) return 'accept_instead'
  return mandateRefusal(context, side, 'settlement_offer', totalCents, now) ?? { lines, totalCents }
}

// Judges one move against the table. A refused move is counted against its side; two in a row are a pass.
export function judgeMove(context: RefereeContext, table: Table, move: ProposedMove, now: Date): Judgment {
  if (table.status !== 'open') return refused(table, 'not_open')
  const ended = ending(context, table, now)
  if (ended !== null) return { outcome: 'ended', table: escalate(table, ended), reason: ended }
  if (move.side !== table.turn) return refused(table, 'not_your_turn')
  const { side } = move
  const moved = { ...table, turn: otherSide(side), lastMoveAt: now, refusals: { ...table.refusals, [side]: 0 } }
  const refuse = (reason: RefusalReason): Judgment => {
    const counted = { ...table, refusals: { ...table.refusals, [side]: table.refusals[side] + 1 } }
    return refused(counted.refusals[side] >= NEGOTIATION_LIMITS.refusalsBeforePass ? escalate(counted, 'refused_twice') : counted, reason)
  }
  if (move.kind === 'pass') return { outcome: 'accepted', table: escalate(moved, 'pass'), totalCents: null }
  if (move.kind === 'accept') {
    const theirs = table.last[otherSide(side)]
    if (theirs === null) return refuse('nothing_to_accept')
    const outside = mandateRefusal(context, side, 'settlement_accept', theirs.totalCents, now)
    if (outside !== null) return refuse(outside)
    return { outcome: 'accepted', table: { ...moved, status: 'agreed', agreed: theirs }, totalCents: theirs.totalCents }
  }
  const judged = judgeOffer(context, table, side, move.lines, now)
  if (typeof judged === 'string') return refuse(judged)
  return { outcome: 'accepted', table: { ...moved, offers: { ...table.offers, [side]: table.offers[side] + 1 }, last: { ...table.last, [side]: judged } }, totalCents: judged.totalCents }
}

// The table rebuilt from the moves the referee accepted, in order. Refusals are counted beside the moves, not in them.
export function replayTable(context: RefereeContext, openedAt: Date, moves: readonly { readonly move: ProposedMove; readonly at: Date }[], refusals: Readonly<Record<NegotiationSide, number>> = { shop: 0, renter: 0 }): Table {
  let table = openTable(openedAt)
  for (const { move, at } of moves) {
    const judged = judgeMove({ ...context, deadline: new Date(8.64e15), mandates: replayMandates(context, at) }, table, move, at)
    if (judged.outcome !== 'accepted') throw new Error(`A stored move was not one the referee accepts: ${judged.outcome === 'refused' ? judged.reason : judged.reason}.`)
    table = judged.table
  }
  return { ...table, refusals: table.status === 'open' ? refusals : table.refusals }
}

// A stored move was judged against the mandates as they stood when it was made. Replaying it later must not refuse it
// because a mandate has since ended: only the limits are judged again.
function replayMandates(context: RefereeContext, at: Date): RefereeContext['mandates'] {
  const asThen = (mandate: Mandate): Mandate => ({ ...mandate, revokedAt: null, validFrom: new Date(Math.min(mandate.validFrom.getTime(), at.getTime())), validUntil: new Date(Math.max(mandate.validUntil.getTime(), at.getTime() + 1)) })
  return { shop: asThen(context.mandates.shop), renter: asThen(context.mandates.renter) }
}
