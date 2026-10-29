import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { lineFlows, rentalMoney } from './money-ledger.ts'
import type { LedgerLine, RentalMoneyFacts } from './money-ledger.ts'

// The money ledger (extensions.md section 12.5): what each line of a rental's money log did, and whether the rental's
// money agrees with its hold, its claim and PayPal.

const at = (day: number) => new Date(Date.UTC(2026, 9, day, 10))
const line = (kind: LedgerLine['kind'], amountCents: number, day: number): LedgerLine => ({ kind, amountCents, occurredAt: at(day) })
const facts = (overrides: Partial<RentalMoneyFacts> = {}): RentalMoneyFacts => ({ reservedCents: 250_00, holdState: 'captured', claimCents: 35_00, paypalDiffers: false, ...overrides })

describe('what each line of a rental did', () => {
  it('sends fees, captures and paid invoices to the shop, refunds back to the renter, and keeps holds and invoices apart', () => {
    expect(lineFlows([line('fee_captured', 40_00, 1), line('hold_placed', 250_00, 1), line('hold_captured', 35_00, 5), line('hold_released', 215_00, 5), line('invoice_sent', 10_00, 6), line('invoice_paid', 10_00, 8), line('refunded', 5_00, 9)], 'captured')).toEqual(['to_shop', 'held', 'to_shop', 'to_renter', 'invoiced', 'to_shop', 'to_renter'])
  })

  it('calls the release of a replaced authorization a replacement, not money back, and only the last release back', () => {
    // A replacement is placed when the renter approves it, and the authorization before it is voided afterwards.
    const replaced = [line('hold_placed', 250_00, 1), line('hold_placed', 250_00, 20), line('hold_released', 250_00, 20)]
    expect(lineFlows(replaced, 'placed')).toEqual(['held', 'held', 'replaced'])
    expect(lineFlows([...replaced, line('hold_released', 250_00, 25)], 'released')).toEqual(['held', 'held', 'replaced', 'to_renter'])
  })

  it('calls a release before the capture a replacement, and the rest released at the capture money back', () => {
    expect(lineFlows([line('hold_placed', 250_00, 1), line('hold_renewed', 250_00, 4), line('hold_released', 250_00, 4), line('hold_captured', 35_00, 9), line('hold_released', 215_00, 9)], 'captured')).toEqual(['held', 'renewed', 'replaced', 'to_shop', 'to_renter'])
  })
})

describe('where a rental’s money stands', () => {
  it('adds up what went to the shop and back to the renter, and agrees when the capture and release fit the hold and the claim', () => {
    const settled = rentalMoney([line('fee_captured', 40_00, 1), line('hold_placed', 250_00, 1), line('hold_captured', 35_00, 5), line('hold_released', 215_00, 5)], facts())
    expect(settled).toEqual({ heldNowCents: 0, toShopCents: 75_00, backCents: 215_00, invoicedUnpaidCents: 0, where: 'taken', checks: [] })
  })

  it('counts the hold as held while PayPal still holds it, and as back with the renter once it was released', () => {
    expect(rentalMoney([line('hold_placed', 250_00, 1)], facts({ holdState: 'placed', claimCents: null }))).toMatchObject({ heldNowCents: 250_00, where: 'held', checks: [] })
    expect(rentalMoney([line('hold_placed', 250_00, 1), line('hold_released', 250_00, 3)], facts({ holdState: 'released', claimCents: null }))).toMatchObject({ heldNowCents: 0, backCents: 250_00, where: 'returned', checks: [] })
    // The rental fee went to the shop, but the hold, which is what the renter worries about, went back.
    expect(rentalMoney([line('fee_captured', 45_00, 1), line('hold_placed', 250_00, 1), line('hold_released', 250_00, 3)], facts({ holdState: 'released', claimCents: null }))).toMatchObject({ toShopCents: 45_00, where: 'returned' })
    // Only the fee has moved, while the hold is still being asked for.
    expect(rentalMoney([line('fee_captured', 35_00, 1)], facts({ holdState: 'requested', claimCents: null }))).toMatchObject({ where: 'taken' })
  })

  it('says what an invoice still waits for, until it is paid', () => {
    const lines = [line('hold_placed', 50_00, 1), line('hold_captured', 50_00, 5), line('invoice_sent', 30_00, 5)]
    expect(rentalMoney(lines, facts({ reservedCents: 50_00, claimCents: 80_00, holdState: 'invoiced' }))).toMatchObject({ invoicedUnpaidCents: 30_00, where: 'invoiced', checks: [] })
    expect(rentalMoney([...lines, line('invoice_paid', 30_00, 9)], facts({ reservedCents: 50_00, claimCents: 80_00, holdState: 'invoiced' }))).toMatchObject({ invoicedUnpaidCents: 0, toShopCents: 80_00, where: 'taken' })
  })

  it('flags a capture above the hold or above the claim a person approved, and a capture with no claim at all', () => {
    expect(rentalMoney([line('hold_placed', 250_00, 1), line('hold_captured', 260_00, 5)], facts({ claimCents: 300_00 })).checks).toEqual(['captured_above_hold'])
    expect(rentalMoney([line('hold_placed', 250_00, 1), line('hold_captured', 50_00, 5), line('hold_released', 200_00, 5)], facts()).checks).toEqual(['captured_above_claim'])
    expect(rentalMoney([line('hold_placed', 250_00, 1), line('hold_captured', 35_00, 5), line('hold_released', 215_00, 5)], facts({ claimCents: null })).checks).toEqual(['captured_above_claim'])
  })

  it('flags a capture and release that together go past the hold, and a refund above what was taken', () => {
    expect(rentalMoney([line('hold_placed', 250_00, 1), line('hold_captured', 35_00, 5), line('hold_released', 250_00, 5)], facts()).checks).toEqual(['settled_above_hold'])
    expect(rentalMoney([line('hold_placed', 250_00, 1), line('hold_captured', 35_00, 5), line('hold_released', 215_00, 5), line('refunded', 40_00, 8)], facts()).checks).toEqual(['refunded_above_taken'])
  })

  it('flags a rental whose hold PayPal records differently, as the operations agent found', () => {
    expect(rentalMoney([line('hold_placed', 250_00, 1)], facts({ holdState: 'placed', claimCents: null, paypalDiffers: true }))).toMatchObject({ where: 'held', checks: ['paypal_differs'] })
  })

  it('has nothing to say about a rental with no money yet', () => {
    expect(rentalMoney([], facts({ reservedCents: null, holdState: null, claimCents: null }))).toEqual({ heldNowCents: 0, toShopCents: 0, backCents: 0, invoicedUnpaidCents: 0, where: 'none', checks: [] })
  })
})

describe('the ledger’s checks, for any settlement Hold makes', () => {
  // A hold, replaced any number of times, then captured for a claim that fits it with the rest released, or released.
  const settlement = fc.record({
    reservedCents: fc.integer({ min: 1, max: 2_000_00 }),
    replacements: fc.integer({ min: 0, max: 3 }),
    share: fc.double({ min: 0, max: 1, noNaN: true }),
    captured: fc.boolean(),
  })

  it('never flags a settlement within the hold and the claim', () => {
    fc.assert(
      fc.property(settlement, ({ reservedCents, replacements, share, captured }) => {
        const claimCents = Math.floor(reservedCents * share)
        const lines: LedgerLine[] = [line('hold_placed', reservedCents, 1)]
        for (let each = 0; each < replacements; each += 1) lines.push(line('hold_released', reservedCents, 2 + each), line('hold_placed', reservedCents, 2 + each))
        if (captured && claimCents > 0) lines.push(line('hold_captured', claimCents, 10), line('hold_released', reservedCents - claimCents, 10))
        else lines.push(line('hold_released', reservedCents, 10))
        const money = rentalMoney(lines, facts({ reservedCents, holdState: captured && claimCents > 0 ? 'captured' : 'released', claimCents: captured ? claimCents : null }))
        expect(money.checks).toEqual([])
        expect(money.backCents + (captured && claimCents > 0 ? claimCents : 0)).toBe(reservedCents)
      }),
    )
  })

  it('always flags a capture above the claim', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2_000_00 }), fc.integer({ min: 1, max: 1_000_00 }), (claimCents, overCents) => {
        const reservedCents = claimCents + overCents
        const money = rentalMoney([line('hold_placed', reservedCents, 1), line('hold_captured', claimCents + overCents, 5)], facts({ reservedCents, claimCents }))
        expect(money.checks).toContain('captured_above_claim')
      }),
    )
  })
})
