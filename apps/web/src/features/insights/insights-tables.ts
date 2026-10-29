import { HOLD_VALIDITY_DAYS, holdDay, holdStanding } from '@hold/domain'
import type { HoldStanding, ItemWear, LineFlow, MoneyEventKind, MoneyWhere, RentalMoney } from '@hold/domain'

// The insights dashboard's tables (extensions.md section 12.5), as AG Studio's data engine reads them: the money
// ledger's lines and rentals, and the fleet's items, as those pages already work them out. Amounts stay in cents; the
// dashboard shows them in the shop's currency. No renter is named: a rental is its identifier. Labels arrive in the
// viewer's language.

// What this reads of the ledger's and the fleet's rows; the route that composes the page hands them in.
export type InsightsLine = { readonly id: string; readonly rentalId: string; readonly kind: MoneyEventKind; readonly flow: LineFlow; readonly amountCents: number; readonly occurredAt: Date }
export type InsightsRental = { readonly rentalId: string; readonly renterName?: string | null; readonly startsAt: Date; readonly simulated: boolean; readonly reservedCents: number | null; readonly trustRung: number | null; readonly ordinaryCents: number | null; readonly money: RentalMoney }
// A hold PayPal holds now, with its clocks.
export type InsightsHold = { readonly rentalId: string; readonly reservedCents: number; readonly createdAt: Date; readonly assuredUntil: Date; readonly validUntil: Date; readonly simulated: boolean }
export type InsightsItem =
  | { readonly kind: 'type' }
  | { readonly kind: 'item'; readonly item: { readonly id: string; readonly label: string; readonly simulated: boolean }; readonly type: { readonly name: string }; readonly wear: ItemWear; readonly openMarks: number; readonly fastest: boolean }

export type InsightsWords = {
  readonly kind: (kind: MoneyEventKind | 'replaced') => string
  readonly flow: (flow: LineFlow) => string
  readonly where: (where: MoneyWhere) => string
  readonly agrees: string
  readonly needsLook: string
  readonly yes: string
  readonly no: string
  readonly rung: (rung: number | null) => string
  readonly standing: (standing: HoldStanding) => string
}

const DAY = 24 * 60 * 60 * 1000
const total = (lines: readonly InsightsLine[], keep: (line: InsightsLine) => boolean) => lines.filter(keep).reduce((sum, line) => sum + line.amountCents, 0)

export type InsightsInput = { readonly lines: readonly InsightsLine[]; readonly rentals: readonly InsightsRental[]; readonly fleet: readonly InsightsItem[]; readonly holds: readonly InsightsHold[]; readonly now: Date }

export function insightsTables({ lines, rentals, fleet, holds, now }: InsightsInput, words: InsightsWords) {
  const linesOf = (rentalId: string) => lines.filter((line) => line.rentalId === rentalId)
  return {
    money: lines.map((line) => ({
      line_id: line.id,
      rental_id: line.rentalId,
      occurred_at: line.occurredAt,
      kind: words.kind(line.kind === 'hold_released' && line.flow === 'replaced' ? 'replaced' : line.kind),
      flow: words.flow(line.flow),
      amount_cents: line.amountCents,
      to_shop_cents: line.flow === 'to_shop' ? line.amountCents : null,
      back_cents: line.flow === 'to_renter' ? line.amountCents : null,
    })),
    rentals: rentals.map((rental) => ({
      rental_id: rental.rentalId,
      starts_at: rental.startsAt,
      where: words.where(rental.money.where),
      held_now_cents: rental.money.heldNowCents,
      to_shop_cents: rental.money.toShopCents,
      back_cents: rental.money.backCents,
      // For the settlement waterfall: what was held, what was taken from it, and what went back from it.
      reserved_cents: rental.reservedCents ?? 0,
      captured_cents: total(linesOf(rental.rentalId), (line) => line.kind === 'hold_captured'),
      released_cents: total(linesOf(rental.rentalId), (line) => line.kind === 'hold_released' && line.flow === 'to_renter'),
      check: rental.money.checks.length === 0 ? words.agrees : words.needsLook,
      sample: rental.simulated,
    })),
    // Every hold, by the rung of the shop's trust ladder that lowered it, and by how much.
    holds: rentals.flatMap((rental) => (rental.reservedCents === null ? [] : [{
      rental_id: rental.rentalId,
      trust_rung: words.rung(rental.trustRung),
      reserved_cents: rental.reservedCents,
      ordinary_cents: rental.ordinaryCents ?? rental.reservedCents,
      lowered_cents: Math.max(0, (rental.ordinaryCents ?? rental.reservedCents) - rental.reservedCents),
      sample: rental.simulated,
    }])),
    // Every hold PayPal holds now, on its 29-day line.
    lives: holds.map((hold) => ({
      rental_id: hold.rentalId,
      reserved_cents: hold.reservedCents,
      day: holdDay(hold, now),
      days: HOLD_VALIDITY_DAYS,
      assured_days: Math.ceil((hold.assuredUntil.getTime() - hold.createdAt.getTime()) / DAY),
      standing: words.standing(holdStanding(hold, now)),
      valid_until: hold.validUntil,
      sample: hold.simulated,
    })),
    items: fleet.flatMap((row) => (row.kind !== 'item' ? [] : [{
      item_id: row.item.id,
      item_type: row.type.name,
      item: row.item.label,
      rentals: row.wear.rentals,
      days_out: row.wear.daysOut,
      damage_found: row.wear.damageFindings,
      priced_cents: row.wear.incurredCents,
      recovered_cents: row.wear.recoveredCents,
      open_marks: row.openMarks,
      wearing_fastest: row.fastest ? words.yes : words.no,
      sample: row.item.simulated,
    }])),
  }
}

export type InsightsTables = ReturnType<typeof insightsTables>
