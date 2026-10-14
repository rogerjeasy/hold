import { money } from '@hold/domain'
import { beforeAll, describe, expect, it } from 'vitest'
import { findPerson, registerOwner } from './accounts.ts'
import { currentPriceList, publishPriceList } from './price-list-repository.ts'
import { takeRateToken } from './rate-limit.ts'
import { inShop } from './scope.ts'
import type { Scope } from './scope.ts'
import { findPayPalAccount, savePayPalAccount, shopSettings } from './shop-repository.ts'
import { acceptInvitation, createInvitation, findInvitation, listOpenInvitations, listStaff, revokeInvitation } from './staff-repository.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const NOW = new Date('2026-10-14T09:00:00Z')
const chf = (cents: number) => money(cents, 'CHF')

let database: TestDatabase
let owner: Scope
let ownerId: string
let shopId: string

beforeAll(async () => {
  database = await createTestDatabase()
  const registered = await registerOwner(database, {
    subject: 'owner-subject',
    email: 'tomas@ribeirabikes.example',
    name: 'Tomás',
    language: 'en',
    shop: { name: 'Ribeira Bikes', timeZone: 'Europe/Lisbon' },
  })
  ownerId = registered.userId
  shopId = registered.shopId
  owner = { role: 'hold_app', shopId, userId: ownerId }
})

const priceList = {
  currency: 'CHF',
  ownerApprovalThreshold: chf(200_00),
  entries: [
    { description: 'Deep scratch on the frame', category: 'damage' as const, amount: chf(35_00) },
    { description: 'Lost lock', category: 'loss' as const, amount: chf(45_00) },
  ],
  wearPolicy: 'Light scuffs are ordinary wear.',
}

describe('the price list', () => {
  it('publishes version 1, and sets the shop’s currency and threshold', async () => {
    expect(await inShop(database, owner, (transaction) => publishPriceList(transaction, shopId, priceList, NOW))).toEqual({ ok: true, version: 1 })

    const current = await inShop(database, owner, currentPriceList)
    expect(current).toMatchObject({ version: 1, currency: 'CHF', wearPolicy: 'Light scuffs are ordinary wear.' })
    expect(current?.entries.map((entry) => [entry.code, entry.amountCents])).toEqual([
      ['deep-scratch-on-the-frame', 35_00],
      ['lost-lock', 45_00],
    ])
    expect(await inShop(database, owner, (transaction) => shopSettings(transaction, shopId))).toMatchObject({ currency: 'CHF', ownerApprovalThresholdCents: 200_00 })
  })

  it('publishes a new version beside the old one, and keeps the currency', async () => {
    const second = { ...priceList, entries: [{ description: 'Lost lock', category: 'loss' as const, amount: chf(50_00) }] }
    expect(await inShop(database, owner, (transaction) => publishPriceList(transaction, shopId, second, NOW))).toEqual({ ok: true, version: 2 })
    expect((await inShop(database, owner, currentPriceList))?.entries).toHaveLength(1)

    const inEuros = { ...second, currency: 'EUR', entries: [{ description: 'Lost lock', category: 'loss' as const, amount: money(50_00, 'EUR') }] }
    expect(await inShop(database, owner, (transaction) => publishPriceList(transaction, shopId, inEuros, NOW))).toEqual({ ok: false, reason: 'currency_fixed' })
  })
})

describe('the PayPal account', () => {
  it('keeps only the reference to the credentials, and replaces it on reconnecting', async () => {
    await inShop(database, owner, (transaction) => savePayPalAccount(transaction, shopId, 'sandbox', 'hold/paypal/shops/a/sandbox'))
    await inShop(database, owner, (transaction) => savePayPalAccount(transaction, shopId, 'sandbox', 'hold/paypal/shops/b/sandbox'))

    expect(await inShop(database, owner, (transaction) => findPayPalAccount(transaction, shopId, 'sandbox'))).toMatchObject({
      credentialReference: 'hold/paypal/shops/b/sandbox',
    })
  })
})

describe('staff invitations', () => {
  async function invite(email: string) {
    return inShop(database, owner, (transaction) =>
      createInvitation(transaction, { shopId, invitedByUserId: ownerId, email, role: 'counter_staff', approvalLimitCents: 100_00, language: 'pt' }, NOW),
    )
  }

  it('gives the invited person their role once they prove the address', async () => {
    const { token } = await invite('Ana@Lisboa.example')
    expect(await findInvitation(database, token, NOW)).toMatchObject({ shopName: 'Ribeira Bikes', email: 'ana@lisboa.example', state: 'open' })

    const accepted = await acceptInvitation(database, { token, subject: 'ana-subject', email: 'ana@lisboa.example', name: 'Ana', language: 'pt' }, NOW)
    expect(accepted).toEqual({ ok: true, shopId })
    expect(await findPerson(database, 'ana-subject')).toMatchObject({ shops: [{ shopId, role: 'counter_staff' }] })
    const staff = await inShop(database, owner, listStaff)
    expect(staff.map((member) => [member.email, member.role, member.approvalLimitCents])).toContainEqual(['ana@lisboa.example', 'counter_staff', 100_00])
  })

  it('refuses an address other than the one invited', async () => {
    const { token } = await invite('rui@porto.example')

    expect(await acceptInvitation(database, { token, subject: 'x', email: 'someone@else.example', name: 'X', language: 'en' }, NOW)).toEqual({ ok: false, reason: 'other_address' })
  })

  it('works once, and not after it is revoked or has expired', async () => {
    const used = await invite('once@shop.example')
    const accept = (token: string, at: Date) => acceptInvitation(database, { token, subject: `s-${token}`, email: 'once@shop.example', name: 'O', language: 'en' }, at)
    expect((await accept(used.token, NOW)).ok).toBe(true)
    expect(await accept(used.token, NOW)).toEqual({ ok: false, reason: 'not_open' })

    const revoked = await invite('once@shop.example')
    expect(await inShop(database, owner, (transaction) => revokeInvitation(transaction, revoked.id, NOW))).toBe(true)
    expect(await accept(revoked.token, NOW)).toEqual({ ok: false, reason: 'not_open' })

    const late = await invite('once@shop.example')
    expect(await accept(late.token, new Date('2026-10-22T09:00:00Z'))).toEqual({ ok: false, reason: 'not_open' })
  })

  it('lists only the invitations still open', async () => {
    const open = await inShop(database, owner, (transaction) => listOpenInvitations(transaction, NOW))
    expect(open.every((invitation) => invitation.email !== 'ana@lisboa.example')).toBe(true)
  })

  it('finds nothing for a token that names no invitation', async () => {
    expect(await findInvitation(database, 'made-up', NOW)).toBeUndefined()
  })

  it('cannot be read by another shop', async () => {
    const other = await registerOwner(database, { subject: 'other', email: 'other@shop.example', name: 'O', language: 'en', shop: { name: 'Other', timeZone: 'UTC' } })
    const seen = await inShop(database, { role: 'hold_app', shopId: other.shopId, userId: other.userId }, (transaction) => listOpenInvitations(transaction, NOW))
    expect(seen).toEqual([])
  })
})

describe('the rate limit', () => {
  const limit = { name: 'test', max: 2, windowSeconds: 60 }

  it('allows requests up to the limit, then refuses, for each subject apart', async () => {
    expect(await takeRateToken(database, limit, 'a@shop.example')).toBe(true)
    expect(await takeRateToken(database, limit, 'A@shop.example')).toBe(true)
    expect(await takeRateToken(database, limit, 'a@shop.example')).toBe(false)
    expect(await takeRateToken(database, limit, 'b@shop.example')).toBe(true)
  })

  it('stores no address', async () => {
    const rows = await database.execute('select key from rate_limits')
    expect(JSON.stringify(rows.rows)).not.toContain('shop.example')
  })
})
