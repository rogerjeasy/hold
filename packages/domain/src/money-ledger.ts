import type { HoldState } from './hold.ts'

// The money ledger (extensions.md section 12.5): what each line of a rental's money log did, and whether the rental's
// money agrees with its hold, the claim a person approved, and PayPal. The money log records what PayPal did; nothing
// here moves money or decides anything, it only reads the lines back.

// extension_captured: extra days a renter paid for from their phone (architecture.md section 6.14), never from the hold.
export const MONEY_EVENT_KINDS = ['fee_captured', 'hold_placed', 'hold_renewed', 'hold_released', 'hold_captured', 'refunded', 'invoice_sent', 'invoice_paid', 'extension_captured'] as const
export type MoneyEventKind = (typeof MONEY_EVENT_KINDS)[number]

// A line of one rental's money log, in the order the log holds them: when it happened, then when it was written.
export type LedgerLine = { readonly kind: MoneyEventKind; readonly amountCents: number; readonly occurredAt: Date }

// Where a line's money went: to the shop, back to the renter, held on the renter's account, held again by a
// reauthorization, released only because a replacement took the hold's place, or asked of the renter by invoice.
export type LineFlow = 'to_shop' | 'to_renter' | 'held' | 'renewed' | 'replaced' | 'invoiced'

// The hold states in which PayPal still holds the renter's money.
const HOLDING: readonly HoldState[] = ['placed', 'renewing', 'at_risk', 'releasing', 'capturing', 'capture_failed']

const FIXED_FLOWS: Readonly<Record<Exclude<MoneyEventKind, 'hold_released'>, LineFlow>> = {
  fee_captured: 'to_shop',
  extension_captured: 'to_shop',
  hold_captured: 'to_shop',
  invoice_paid: 'to_shop',
  refunded: 'to_renter',
  hold_placed: 'held',
  hold_renewed: 'renewed',
  invoice_sent: 'invoiced',
}

// A replacement voids the authorization before it, for the whole hold, after the new one is placed. So a release is
// money back only when the hold was settled by it: at or after the capture, or, with nothing captured, the last
// release once PayPal holds nothing. Every other release only made way for the hold that replaced it.
export function lineFlows(lines: readonly LedgerLine[], holdState: HoldState | null): LineFlow[] {
  const firstCapture = lines.findIndex((line) => line.kind === 'hold_captured')
  const lastRelease = lines.findLastIndex((line) => line.kind === 'hold_released')
  const holding = holdState !== null && HOLDING.includes(holdState)
  return lines.map((line, index) => {
    if (line.kind !== 'hold_released') return FIXED_FLOWS[line.kind]
    const settled = firstCapture === -1 ? index === lastRelease && !holding : index > firstCapture
    return settled ? 'to_renter' : 'replaced'
  })
}

// What the ledger checks for each rental, each said in words on the page. None should ever be found: each is a rule
// Hold keeps in plain code, so the ledger shows that it held.
export const MONEY_CHECKS = ['captured_above_hold', 'captured_above_claim', 'settled_above_hold', 'refunded_above_taken', 'paypal_differs'] as const
export type MoneyCheck = (typeof MONEY_CHECKS)[number]

// Where the rental's money is now: held on the renter's account, taken by the shop, back with the renter, asked for by
// an invoice not yet paid, or none moved yet.
export type MoneyWhere = 'held' | 'taken' | 'returned' | 'invoiced' | 'none'

export type RentalMoneyFacts = {
  // The hold as it stands, from the holds table; none before a hold was asked for.
  readonly reservedCents: number | null
  readonly holdState: HoldState | null
  // The claim's total once a person approved it; none when no claim was approved.
  readonly claimCents: number | null
  // The operations agent found PayPal's record of the hold different from Hold's, and nobody has resolved it.
  readonly paypalDiffers: boolean
}

export type RentalMoney = {
  readonly heldNowCents: number
  readonly toShopCents: number
  readonly backCents: number
  readonly invoicedUnpaidCents: number
  readonly where: MoneyWhere
  readonly checks: readonly MoneyCheck[]
}

const sum = (lines: readonly LedgerLine[], kind: MoneyEventKind) => lines.filter((line) => line.kind === kind).reduce((total, line) => total + line.amountCents, 0)

export function rentalMoney(lines: readonly LedgerLine[], facts: RentalMoneyFacts): RentalMoney {
  const flows = lineFlows(lines, facts.holdState)
  const flowing = (flow: LineFlow) => lines.filter((_, index) => flows[index] === flow).reduce((total, line) => total + line.amountCents, 0)
  const captured = sum(lines, 'hold_captured')
  const refunded = sum(lines, 'refunded')
  const invoicePaid = sum(lines, 'invoice_paid')
  const released = lines.filter((line, index) => line.kind === 'hold_released' && flows[index] === 'to_renter').reduce((total, line) => total + line.amountCents, 0)
  const heldNowCents = facts.reservedCents !== null && facts.holdState !== null && HOLDING.includes(facts.holdState) ? facts.reservedCents : 0
  const toShopCents = flowing('to_shop')
  const backCents = flowing('to_renter')
  const invoicedUnpaidCents = Math.max(0, sum(lines, 'invoice_sent') - invoicePaid)

  const checks: MoneyCheck[] = []
  const reserved = facts.reservedCents
  if (reserved !== null && captured > reserved) checks.push('captured_above_hold')
  if (captured > 0 && (facts.claimCents === null || captured > facts.claimCents)) checks.push('captured_above_claim')
  if (reserved !== null && captured <= reserved && captured + released > reserved) checks.push('settled_above_hold')
  if (refunded > captured + invoicePaid) checks.push('refunded_above_taken')
  if (facts.paypalDiffers) checks.push('paypal_differs')

  // Where the hold's money is comes first, as it is what the renter and the shop ask about; a rental fee alone counts
  // only when no hold has moved.
  const charged = captured + invoicePaid
  const where: MoneyWhere = invoicedUnpaidCents > 0 ? 'invoiced' : heldNowCents > 0 ? 'held' : charged > 0 ? 'taken' : backCents > 0 ? 'returned' : toShopCents > 0 ? 'taken' : 'none'
  return { heldNowCents, toShopCents, backCents, invoicedUnpaidCents, where, checks }
}
