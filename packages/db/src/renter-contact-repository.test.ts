import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { storeRenterCode } from './claim-code-repository.ts'
import { chooseEmail, confirmPhone, decisionCopyRecipient, markPhoneNoticeSent, markTextStatus, phoneNoticeDue, recordText, requestPhoneCode, shownTexts, textsOf } from './renter-contact-repository.ts'
import { renterContact } from './renter-repository.ts'
import { renterLinks, rentals, shops } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Transaction } from './scope.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import type { ReadyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const NOW = new Date('2026-11-02T10:00:00Z')
const after = (seconds: number) => new Date(NOW.getTime() + seconds * 1000)
let database: TestDatabase
let shop: ReadyRentalShop
let other: ReadyRentalShop

beforeAll(async () => {
  database = await createTestDatabase()
  shop = await readyRentalShop(database, 'texts', NOW)
  other = await readyRentalShop(database, 'texts-other', NOW)
})
afterAll(async () => { await database.$client.close() })

const rentalRow = async (rentalId: string) => (await database.select().from(rentals).where(eq(rentals.id, rentalId)))[0]

describe('a renter who chooses texts before the hold is placed', () => {
  it('confirms the number they typed with the code texted to it', async () => {
    const rentalId = await shop.paidRental('PAYER-TEXT-1')
    expect(await shop.act((transaction) => requestPhoneCode(transaction, rentalId, { typed: '+41 79 123 45 67', hash: 'first', stepUp: false }, NOW))).toEqual({ ok: true, phone: '+41791234567', confirmed: false })
    expect(await rentalRow(rentalId)).toMatchObject({ contactChannel: 'text', contactPhone: '+41791234567', phoneConfirmedAt: null })
    expect(await shop.act((transaction) => confirmPhone(transaction, rentalId, 'wrong', NOW))).toEqual({ ok: false, reason: 'wrong_code' })
    expect(await shop.act((transaction) => confirmPhone(transaction, rentalId, 'first', after(30)))).toEqual({ ok: true, phone: '+41791234567' })
    expect((await rentalRow(rentalId))?.phoneConfirmedAt).toEqual(after(30))
    expect(await shop.act((transaction) => renterContact(transaction, rentalId))).toMatchObject({ channel: 'text', phone: '+41791234567', phoneConfirmed: true })
    // The code is used once.
    expect(await shop.act((transaction) => confirmPhone(transaction, rentalId, 'first', after(40)))).toEqual({ ok: false, reason: 'code_expired' })
  })

  it('refuses a number without a country code, or in a country Hold does not text', async () => {
    const rentalId = await shop.paidRental('PAYER-TEXT-2')
    expect(await shop.act((transaction) => requestPhoneCode(transaction, rentalId, { typed: '079 123 45 67', hash: 'h', stepUp: false }, NOW))).toEqual({ ok: false, reason: 'phone_invalid' })
    expect(await shop.act((transaction) => requestPhoneCode(transaction, rentalId, { typed: '+881 6123 45678', hash: 'h', stepUp: false }, NOW))).toEqual({ ok: false, reason: 'country_not_texted' })
    expect((await rentalRow(rentalId))?.contactChannel).toBe('email')
  })

  it('keeps the money codes’ rules: another code only after a minute, ten minutes to use it, three tries', async () => {
    const rentalId = await shop.paidRental('PAYER-TEXT-3')
    await shop.act((transaction) => requestPhoneCode(transaction, rentalId, { typed: '+351912345678', hash: 'one', stepUp: false }, NOW))
    expect(await shop.act((transaction) => requestPhoneCode(transaction, rentalId, { typed: '+351912345678', hash: 'two', stepUp: false }, after(59)))).toEqual({ ok: false, reason: 'code_recently_sent' })
    expect(await shop.act((transaction) => confirmPhone(transaction, rentalId, 'one', after(600)))).toEqual({ ok: false, reason: 'code_expired' })
    await shop.act((transaction) => requestPhoneCode(transaction, rentalId, { typed: '+351912345678', hash: 'three', stepUp: false }, after(601)))
    for (let attempt = 0; attempt < 3; attempt += 1) expect(await shop.act((transaction) => confirmPhone(transaction, rentalId, 'wrong', after(602)))).toEqual({ ok: false, reason: 'wrong_code' })
    expect(await shop.act((transaction) => confirmPhone(transaction, rentalId, 'three', after(603)))).toEqual({ ok: false, reason: 'code_expired' })
  })

  it('is only shown its texts, never sent them, in a demo shop or for a sample rental', async () => {
    const rentalId = await shop.paidRental('PAYER-TEXT-6')
    expect(await shop.act((transaction) => renterContact(transaction, rentalId))).toMatchObject({ shopId: shop.scope.shopId, simulated: false })
    await database.update(rentals).set({ simulated: true }).where(eq(rentals.id, rentalId))
    expect(await shop.act((transaction) => renterContact(transaction, rentalId))).toMatchObject({ simulated: true })
    const demo = await readyRentalShop(database, 'texts-demo', NOW)
    await database.update(shops).set({ demoSession: true }).where(eq(shops.id, demo.scope.shopId))
    const demoRental = await demo.paidRental('PAYER-TEXT-7')
    expect(await demo.act((transaction) => renterContact(transaction, demoRental))).toMatchObject({ simulated: true })
  })

  it('is reachable with only a phone, before anyone paid and with no email given', async () => {
    const rentalId = await shop.paidRental('PAYER-TEXT-8')
    await database.update(rentals).set({ renterId: null, contactEmail: null, contactChannel: 'text', contactPhone: '+41791234567' }).where(eq(rentals.id, rentalId))
    expect(await shop.act((transaction) => renterContact(transaction, rentalId))).toMatchObject({ email: null, channel: 'text', phone: '+41791234567' })
    await database.update(rentals).set({ contactChannel: 'email', contactPhone: null }).where(eq(rentals.id, rentalId))
    expect(await shop.act((transaction) => renterContact(transaction, rentalId))).toBeUndefined()
  })

  it('may go back to email, which keeps the number for later', async () => {
    const rentalId = await shop.paidRental('PAYER-TEXT-4')
    await shop.act((transaction) => requestPhoneCode(transaction, rentalId, { typed: '+4915112345678', hash: 'h', stepUp: false }, NOW))
    await shop.act((transaction) => chooseEmail(transaction, rentalId))
    expect(await rentalRow(rentalId)).toMatchObject({ contactChannel: 'email', contactPhone: '+4915112345678' })
  })
})

describe('changing the number once the hold is placed', () => {
  it('needs the code from the channel trusted now, so whoever has only the link cannot take the codes', async () => {
    const { rentalId } = await shop.readyRental()
    await database.update(rentals).set({ contactChannel: 'text', contactPhone: '+41791234567', phoneConfirmedAt: NOW }).where(eq(rentals.id, rentalId))
    expect(await shop.act((transaction) => requestPhoneCode(transaction, rentalId, { typed: '+33612345678', hash: 'h', stepUp: false }, NOW))).toEqual({ ok: false, reason: 'code_needed' })
    expect(await rentalRow(rentalId)).toMatchObject({ contactPhone: '+41791234567', phoneConfirmedAt: NOW })
    // The number already confirmed needs no new code.
    expect(await shop.act((transaction) => requestPhoneCode(transaction, rentalId, { typed: '+41 79 123 45 67', hash: 'h', stepUp: false }, NOW))).toEqual({ ok: true, phone: '+41791234567', confirmed: true })
    // With the code from the trusted channel, the new number is set, and is not trusted until it is confirmed.
    expect(await shop.act((transaction) => requestPhoneCode(transaction, rentalId, { typed: '+33612345678', hash: 'new', stepUp: true }, NOW))).toEqual({ ok: true, phone: '+33612345678', confirmed: false })
    expect(await rentalRow(rentalId)).toMatchObject({ contactPhone: '+33612345678', phoneConfirmedAt: null })
  })
})

describe('where a money code goes', () => {
  it('is the confirmed phone of a renter who chose texts, unless they ask for their PayPal email', async () => {
    const { rentalId } = await shop.readyRental()
    await database.update(rentals).set({ contactChannel: 'text', contactPhone: '+41791234567', phoneConfirmedAt: NOW }).where(eq(rentals.id, rentalId))
    const [link] = await database.insert(renterLinks).values({ shopId: shop.scope.shopId, rentalId, tokenFingerprint: `texts-${rentalId}`, scopes: ['view', 'accept', 'contest'], expiresAt: new Date('2027-01-01') }).returning()
    if (link === undefined) throw new Error('No link')
    expect(await shop.act((transaction) => storeRenterCode(transaction, link, 'h1', NOW))).toEqual({ ok: true, channel: 'text', phone: '+41791234567' })
    const [fresh] = await database.select().from(renterLinks).where(eq(renterLinks.id, link.id))
    expect(await shop.act((transaction) => storeRenterCode(transaction, fresh ?? link, 'h2', after(61), 'email'))).toEqual({ ok: true, channel: 'email', email: 'priya@example.com', sandboxContact: false })
  })
})

describe('a copy of a money decision', () => {
  it('goes to the email PayPal gave when the renter’s codes go to a confirmed phone, and nowhere otherwise', async () => {
    const { rentalId } = await shop.readyRental()
    expect(await shop.act((transaction) => decisionCopyRecipient(transaction, rentalId))).toBeUndefined()
    await database.update(rentals).set({ contactChannel: 'text', contactPhone: '+41791234567' }).where(eq(rentals.id, rentalId))
    expect(await shop.act((transaction) => decisionCopyRecipient(transaction, rentalId))).toBeUndefined()
    await database.update(rentals).set({ phoneConfirmedAt: NOW }).where(eq(rentals.id, rentalId))
    expect(await shop.act((transaction) => decisionCopyRecipient(transaction, rentalId))).toEqual({ email: 'priya@example.com', sandboxContact: false })
  })
})

describe('telling the payer a number was confirmed', () => {
  it('waits until PayPal names the payer, is told once, and is due again for each new number', async () => {
    const rentalId = await shop.paidRental('PAYER-TEXT-NOTICE')
    const [paid] = await database.select({ renterId: rentals.renterId }).from(rentals).where(eq(rentals.id, rentalId))
    // Confirmed before anyone paid: nobody to tell yet.
    await database.update(rentals).set({ renterId: null }).where(eq(rentals.id, rentalId))
    await shop.act((transaction) => requestPhoneCode(transaction, rentalId, { typed: '+41791234567', hash: 'first', stepUp: false }, NOW))
    await shop.act((transaction) => confirmPhone(transaction, rentalId, 'first', NOW))
    expect(await shop.act((transaction) => phoneNoticeDue(transaction, rentalId))).toBeUndefined()
    // PayPal names the payer: the notice is now due, with the number to tell.
    await database.update(rentals).set({ renterId: paid?.renterId ?? null }).where(eq(rentals.id, rentalId))
    expect(await shop.act((transaction) => phoneNoticeDue(transaction, rentalId))).toEqual({ email: 'priya@example.com', sandboxContact: false, phone: '+41791234567' })
    await shop.act((transaction) => markPhoneNoticeSent(transaction, rentalId, NOW))
    expect(await shop.act((transaction) => phoneNoticeDue(transaction, rentalId))).toBeUndefined()
    // A new number is told again.
    await shop.act((transaction) => requestPhoneCode(transaction, rentalId, { typed: '+33612345678', hash: 'second', stepUp: false }, after(120)))
    await shop.act((transaction) => confirmPhone(transaction, rentalId, 'second', after(130)))
    expect(await shop.act((transaction) => phoneNoticeDue(transaction, rentalId))).toMatchObject({ phone: '+33612345678' })
  })
})

describe('the texts sent to a renter', () => {
  it('keep their words only when a demo shop showed them instead of sending, and take the status AWS reports', async () => {
    const rentalId = await shop.paidRental('PAYER-TEXT-5')
    await shop.act((transaction) => recordText(transaction, { rentalId, purpose: 'renter_link', toPhone: '+41791234567', status: 'sent', providerMessageId: 'aws-1', body: null, failure: null }, NOW))
    await shop.act((transaction) => recordText(transaction, { rentalId, purpose: 'phone_code', toPhone: '+41791234567', status: 'simulated', providerMessageId: null, body: 'Your code is 12345678', failure: null }, after(1)))
    await expect(shop.act((transaction) => recordText(transaction, { rentalId, purpose: 'renter_code', toPhone: '+41791234567', status: 'sent', providerMessageId: 'aws-2', body: 'Your code is 87654321', failure: null }, NOW))).rejects.toThrow()
    expect(await shop.act((transaction) => shownTexts(transaction, rentalId))).toEqual([expect.objectContaining({ purpose: 'phone_code', body: 'Your code is 12345678' })])

    // AWS reports each text with the shop it carried as context, so the worker updates it inside that shop.
    const asWorker = <Result>(shopId: string, work: (transaction: Transaction) => Promise<Result>) => inShop(database, { role: 'hold_worker', shopId }, work)
    expect(await asWorker(shop.scope.shopId, (transaction) => markTextStatus(transaction, 'aws-1', { status: 'delivered', failure: null }, after(5)))).toBe(true)
    expect(await asWorker(shop.scope.shopId, (transaction) => markTextStatus(transaction, 'unknown', { status: 'delivered', failure: null }, after(5)))).toBe(false)
    expect(await asWorker(other.scope.shopId, (transaction) => markTextStatus(transaction, 'aws-1', { status: 'failed', failure: 'forged' }, after(6)))).toBe(false)
    expect(await shop.act((transaction) => textsOf(transaction, rentalId))).toEqual([expect.objectContaining({ purpose: 'phone_code', status: 'simulated' }), expect.objectContaining({ purpose: 'renter_link', status: 'delivered', toPhone: '+41 ••• •• 67', statusAt: after(5) })])
    expect(await other.act((transaction) => textsOf(transaction, rentalId))).toEqual([])
    expect(await other.act((transaction) => shownTexts(transaction, rentalId))).toEqual([])
  })
})
