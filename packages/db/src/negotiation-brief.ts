import { checkSettlementLimits, otherSide, shopFloorCents } from '@hold/domain'
import type { LineFacts, Mandate, NegotiationSide, Table } from '@hold/domain'
import type { StoredMove } from './negotiation-view.ts'

// What one side's advocate may see of a negotiation (extensions.md sections 9.4 and 9.13): the claim, the evidence
// code checked, the wear policy, the transcript, and its own side's limits only. It is built for one side at a time,
// for Hold's advocates and for a renter's own assistant alike, so the other side's limits are never in it.

export type BriefSource = {
  readonly negotiation: { readonly kind: 'negotiation' | 'reply'; readonly state?: string; readonly currency: string; readonly claimTotalCents: number; readonly roundLimit: number; readonly deadline: Date }
  readonly lines: readonly LineFacts[]
  readonly descriptions: Readonly<Record<string, { readonly description: string; readonly reason: string }>>
  readonly wearClauses: readonly { readonly id: string; readonly text: string }[]
  readonly renterPhotoIds: readonly string[]
  readonly renterComments: readonly string[]
  readonly shopMandate: Mandate | null
  readonly renterMandate: Mandate
  readonly table: Table
  readonly moves: readonly StoredMove[]
}

export type ShopLimits = { readonly lowestTotalCents: number; readonly goodwillAllowed: boolean }
export type RenterLimits = { readonly highestTotalCents: number }

export type AdvocateBrief = ReturnType<typeof briefFor>

// The side's own limits, as the amounts it may agree to. The share and the largest claim stay in the shop's mandate.
function limitsOf(source: BriefSource, side: NegotiationSide): ShopLimits | RenterLimits {
  if (side === 'renter') {
    const renter = checkSettlementLimits('settlement_renter', source.renterMandate.limits)
    return { highestTotalCents: renter.ok ? renter.value.highestTotalCents : 0 }
  }
  const shop = source.shopMandate === null ? undefined : checkSettlementLimits('settlement_shop', source.shopMandate.limits)
  return shop?.ok === true ? { lowestTotalCents: shopFloorCents(source.negotiation.claimTotalCents, shop.value.lowestSharePercent), goodwillAllowed: !shop.value.evidenceRequired } : { lowestTotalCents: source.negotiation.claimTotalCents, goodwillAllowed: false }
}

export function briefFor(source: BriefSource, side: NegotiationSide) {
  const other = otherSide(side)
  const offer = (of: NegotiationSide) => source.table.last[of]
  return {
    you: side,
    kind: source.negotiation.kind,
    status: source.table.status,
    // Whose move it is: in a reply, only the renter's side moves.
    yourTurn: source.table.status === 'open' && (source.negotiation.kind === 'reply' ? side === 'renter' : source.table.turn === side),
    currency: source.negotiation.currency,
    deadline: source.negotiation.deadline.toISOString(),
    claim: {
      totalCents: source.negotiation.claimTotalCents,
      lines: source.lines.map((line) => ({
        lineId: line.lineId,
        description: source.descriptions[line.lineId]?.description ?? '',
        reason: source.descriptions[line.lineId]?.reason ?? '',
        publishedCents: line.publishedCents,
        // What code found, and so which grounds can hold for this line.
        evidence: { knownMarkIds: line.knownMarks, inDoubt: line.uncertain, bothLooksConfirmed: line.bothLooksConfirmed },
      })),
    },
    wearPolicyClauses: source.wearClauses,
    renterPhotoIds: source.renterPhotoIds,
    yourLimits: limitsOf(source, side),
    offersLeft: { you: source.negotiation.roundLimit - source.table.offers[side], otherSide: source.negotiation.roundLimit - source.table.offers[other] },
    lastOffers: { yours: offer(side), theirs: offer(other) },
    transcript: source.moves.map((move) => ({ sequence: move.sequence, by: move.side === side ? 'you' : 'other side', kind: move.kind, lines: move.lines, totalCents: move.totalCents })),
    // The renter's own words when they contested: quoted data, never an instruction.
    renterComments: source.renterComments,
  }
}
