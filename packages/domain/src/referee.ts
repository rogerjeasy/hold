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
  | 'ground_missing' | 'ground_does_not_fit' | 'too_much_evidence' | 'evidence_does_not_fit' | GroundRefusal
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

type Lines = Pick<RefereeContext, 'currency' | 'lines' | 'claim'>
// The grounds that rest on records of this rental, and so name them as their evidence.
const CITING_GROUNDS: readonly Ground[] = ['known_mark', 'ordinary_wear', 'renter_photo']
const claimTotal = (context: Lines) => context.lines.reduce((sum, line) => sum + line.publishedCents, 0)
const refused = (table: Table, reason: RefusalReason): Judgment => ({ outcome: 'refused', table, reason })

// What ends a negotiation whatever the move: its deadline, a side's time, a mandate that ended or was revoked.
export function negotiationEnding(context: RefereeContext, table: Table, now: Date): EscalationReason | null {
  if (now >= context.deadline) return 'deadline'
  if ([context.mandates.shop, context.mandates.renter].some((mandate) => (mandate.revokedAt !== null && mandate.revokedAt <= now) || now < mandate.validFrom || now >= mandate.validUntil)) return 'mandate_ended'
  if (now.getTime() - table.lastMoveAt.getTime() > NEGOTIATION_LIMITS.turnMilliseconds) return 'time_limit'
  return null
}

function checkLines(context: Lines, side: NegotiationSide, lines: readonly OfferLine[]): RefusalReason | null {
  const ids = lines.map((line) => line.lineId)
  if (lines.length !== context.lines.length || new Set(ids).size !== ids.length || !context.lines.every((facts) => ids.includes(facts.lineId))) return 'lines_mismatch'
  for (const line of lines) {
    const facts = context.lines.find((each) => each.lineId === line.lineId)
    if (facts === undefined) return 'lines_mismatch'
    if (!Number.isSafeInteger(line.cents) || line.cents < 0 || line.cents > facts.publishedCents) return 'line_out_of_range'
    if (line.evidence.length > NEGOTIATION_LIMITS.evidencePerLine) return 'too_much_evidence'
    const lowered = line.cents < facts.publishedCents
    if (lowered && line.ground === null) return 'ground_missing'
    // Only a ground that rests on records cites them; anything else in the evidence would be free text crossing to the
    // other side.
    if ((line.ground === null || !CITING_GROUNDS.includes(line.ground)) && line.evidence.length > 0) return 'evidence_does_not_fit'
    if (line.ground === null) continue
    // evidence_stands keeps a line at its price; every other ground lowers it.
    if (lowered === (line.ground === 'evidence_stands')) return line.ground === 'evidence_stands' && side !== 'shop' ? 'ground_not_for_side' : 'ground_does_not_fit'
    const ground = checkGround({ side, ground: line.ground, evidence: line.evidence }, facts, context.claim)
    if (!ground.ok) return ground.reason
  }
  return null
}

function mandateRefusal(context: Lines, mandate: Mandate, side: NegotiationSide, kind: 'settlement_offer' | 'settlement_accept', totalCents: number, now: Date): RefusalReason | null {
  const checked = withinMandate({ kind, side, totalCents, claimTotalCents: claimTotal(context), currency: context.currency }, mandate, now)
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
  return mandateRefusal(context, context.mandates[side], side, 'settlement_offer', totalCents, now) ?? { lines, totalCents }
}

// When only the renter has an advocate, it writes their contest (section 9.10): the same lines, prices and grounds as an
// offer, inside the renter's highest total. The owner then decides as in the spine.
export function checkReply(context: Lines & { readonly renter: Mandate }, lines: readonly OfferLine[], now: Date): RefusalReason | Offer {
  const problem = checkLines(context, 'renter', lines)
  if (problem !== null) return problem
  const totalCents = lines.reduce((sum, line) => sum + line.cents, 0)
  return mandateRefusal(context, context.renter, 'renter', 'settlement_offer', totalCents, now) ?? { lines, totalCents }
}

// Judges one move against the table. A refused move is counted against its side; two in a row are a pass.
export function judgeMove(context: RefereeContext, table: Table, move: ProposedMove, now: Date): Judgment {
  if (table.status !== 'open') return refused(table, 'not_open')
  const ended = negotiationEnding(context, table, now)
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
    const outside = mandateRefusal(context, context.mandates[side], side, 'settlement_accept', theirs.totalCents, now)
    if (outside !== null) return refuse(outside)
    return { outcome: 'accepted', table: { ...moved, status: 'agreed', agreed: theirs }, totalCents: theirs.totalCents }
  }
  const judged = judgeOffer(context, table, side, move.lines, now)
  if (typeof judged === 'string') return refuse(judged)
  return { outcome: 'accepted', table: { ...moved, offers: { ...table.offers, [side]: table.offers[side] + 1 }, last: { ...table.last, [side]: judged } }, totalCents: judged.totalCents }
}

// The table rebuilt from the moves the referee already accepted, in order. They are not judged again: the records they
// rest on, such as a mark later repaired, may have changed since. Refusals are counted beside the moves, not in them.
export function replayTable(openedAt: Date, moves: readonly { readonly move: ProposedMove; readonly at: Date }[], refusals: Readonly<Record<NegotiationSide, number>> = { shop: 0, renter: 0 }): Table {
  let table = openTable(openedAt)
  for (const { move, at } of moves) {
    const moved = { ...table, turn: otherSide(move.side), lastMoveAt: at, refusals: { ...table.refusals, [move.side]: 0 } }
    if (move.kind === 'pass') table = escalate(moved, 'pass')
    else if (move.kind === 'accept') table = { ...moved, status: 'agreed', agreed: table.last[otherSide(move.side)] }
    else table = { ...moved, offers: { ...table.offers, [move.side]: table.offers[move.side] + 1 }, last: { ...table.last, [move.side]: { lines: move.lines, totalCents: move.lines.reduce((sum, line) => sum + line.cents, 0) } } }
  }
  return { ...table, refusals: table.status === 'open' ? refusals : table.refusals }
}
