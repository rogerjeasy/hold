// @vitest-environment node
import { inShop, priceEntries, rentalDetail, renterContact, textsOf } from '@hold/db'
import type { Text } from '@hold/notify'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 12).toString('base64')
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: (name: string) => jar.has(name) ? { name, value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value), delete: (cookie: string | { name: string }) => jar.delete(typeof cookie === 'string' ? cookie : cookie.name) }), headers: () => Promise.resolve(new Headers()) }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string, values?: Record<string, unknown>) => `${key}${values === undefined ? '' : ` ${JSON.stringify(values)}`}`) }))
const contact = await import('./renter-actions')
const claims = await import('@/features/claims/renter-actions')
const { getServices, TEST_SIGN_IN_CODE } = await import('@/server/services')
const { form } = await import('@/test/shop-session')
const { handoverShop } = await import('@/test/ready-rental')
const { presentedClaimOf } = await import('@/test/presented-claim')
const { conditionLink } = await import('@/server/condition-link')

// A renter chooses texts on their own phone and confirms the number (architecture.md section 12.3): links, notices and
// one-time codes then reach them there, a money decision is copied to the email PayPal gave, and once the hold is placed
// the number changes only with a code from the channel trusted now.

const OWNER = 'owner@contact-flow.example'
let shop: Awaited<ReturnType<typeof handoverShop>>
let priceId: string
const texts = async () => ((await getServices()).texter as unknown as { sent: readonly Text[] }).sent
const emails = async () => ((await getServices()).mailer as unknown as { sent: readonly { to: string; subject: string; text: string }[] }).sent
const scoped = async <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, work)

beforeAll(async () => {
  shop = await handoverShop(jar, OWNER, 'Contact Bikes')
  priceId = (await scoped((transaction) => transaction.select().from(priceEntries)))[0]?.id ?? ''
})
beforeEach(() => { jar.clear() })

// Chooses texts and confirms the number at the counter, before the hold.
const confirmedAtCounter = (phone: string) => async (token: string) => {
  const sent = await contact.sendPhoneCode(null, form({ token, phone, changeCode: '', locale: 'en' }))
  if (!sent.ok) throw new Error(JSON.stringify(sent))
  const confirmed = await contact.confirmPhone(null, form({ token, code: TEST_SIGN_IN_CODE, locale: 'en' }))
  if (!confirmed.ok) throw new Error(JSON.stringify(confirmed))
}

describe('a renter who chooses texts at the counter', () => {
  it('confirms their number with a code that fills itself in on their phone, before the hold is placed', async () => {
    const rental = await shop.readyRental(1, async (token) => {
      expect(await contact.sendPhoneCode(null, form({ token, phone: '079 123 45 67', changeCode: '', locale: 'en' }))).toMatchObject({ ok: false, reason: 'phone_invalid' })
      expect(await contact.sendPhoneCode(null, form({ token, phone: '+41 79 123 45 67', changeCode: '', locale: 'en' }))).toEqual({ ok: true, value: { phone: '+41 ••• •• 67', confirmed: false, shown: null } })
      const text = (await texts()).at(-1)
      expect(text).toMatchObject({ to: '+41791234567' })
      // The last line lets the phone offer the code on Hold's own site, and nowhere else.
      expect(text?.body.endsWith(`@localhost #${TEST_SIGN_IN_CODE}`)).toBe(true)
      expect(await contact.confirmPhone(null, form({ token, code: '00000000', locale: 'en' }))).toMatchObject({ ok: false, reason: 'wrong_code' })
      expect(await contact.confirmPhone(null, form({ token, code: TEST_SIGN_IN_CODE, locale: 'en' }))).toEqual({ ok: true, value: { phone: '+41 ••• •• 67' } })
    })
    expect(await scoped((transaction) => renterContact(transaction, rental.rentalId))).toMatchObject({ channel: 'text', phone: '+41791234567', phoneConfirmed: true })
    expect(await scoped((transaction) => textsOf(transaction, rental.rentalId))).toEqual([expect.objectContaining({ purpose: 'phone_code', status: 'sent' })])
  })

  it('tells the email PayPal gave whenever a number is confirmed, so a number someone else set never goes unnoticed', async () => {
    const before = (await emails()).length
    const rental = await shop.readyRental(1, confirmedAtCounter('+4915100000001'))
    const told = (await emails()).slice(before).filter((email) => email.text.includes('+49 ••• •• 01'))
    expect(told).toEqual([expect.objectContaining({ to: 'renter@fake-paypal.test' })])
    // Told once: the first code texted to the phone afterwards sends no second notice.
    await contact.sendContactChangeCode(null, form({ token: rental.token, locale: 'en' }))
    expect((await emails()).filter((email) => email.text.includes('+49 ••• •• 01'))).toHaveLength(1)
  })

  it('gets the money code by text, may ask for it by email instead, and every decision is copied to the email PayPal gave', async () => {
    const claim = await presentedClaimOf(jar, shop, await shop.readyRental(1, confirmedAtCounter('+33612345678')), priceId)
    jar.clear()
    expect(await claims.sendClaimCode(null, form({ token: claim.claimToken, via: 'chosen', locale: 'en' }))).toEqual({ ok: true, value: { via: 'text', phone: '+33 ••• •• 78', sandboxContact: false, shown: null } })
    expect((await texts()).at(-1)?.body).toContain(TEST_SIGN_IN_CODE)
    const before = (await emails()).length
    // Asked again a minute later, by email.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 61_000)
    try {
      expect(await claims.sendClaimCode(null, form({ token: claim.claimToken, via: 'email', locale: 'en' }))).toMatchObject({ ok: true, value: { via: 'email', phone: null } })
    } finally {
      vi.useRealTimers()
    }
    expect((await emails()).slice(before)).toEqual([expect.objectContaining({ to: 'renter@fake-paypal.test' })])
    expect(await claims.acceptClaim(null, form({ token: claim.claimToken, code: TEST_SIGN_IN_CODE, locale: 'en' }))).toMatchObject({ ok: true })
    expect((await emails()).at(-1)).toMatchObject({ to: 'renter@fake-paypal.test', text: expect.stringContaining('claim_accepted') as unknown })
  })
})

describe('the links a texting renter is sent', () => {
  it('include the condition report at handover, by text and not by email', async () => {
    const rental = await shop.readyRental(1, confirmedAtCounter('+3531234567890'))
    const before = (await emails()).length
    const detail = await scoped((transaction) => rentalDetail(transaction, rental.rentalId, new Date()))
    if (detail === undefined) throw new Error('No rental')
    expect(await scoped((transaction) => conditionLink(transaction, shop.shopId, 'Contact Bikes', detail))).toMatchObject({ sent: 'text' })
    expect((await texts()).at(-1)).toMatchObject({ to: '+3531234567890', body: expect.stringContaining('/condition') as unknown })
    expect((await emails()).length).toBe(before)
  })
})

describe('changing the number once the hold is placed', () => {
  it('needs the code sent to the phone trusted now, so whoever has only the link cannot take the codes', async () => {
    const rental = await shop.readyRental(1, confirmedAtCounter('+4915112345678'))
    jar.clear()
    expect(await contact.sendPhoneCode(null, form({ token: rental.token, phone: '+33699999999', changeCode: '', locale: 'en' }))).toMatchObject({ ok: false, reason: 'code_needed' })
    expect(await contact.sendContactChangeCode(null, form({ token: rental.token, locale: 'en' }))).toMatchObject({ ok: true, value: { via: 'text', phone: '+49 ••• •• 78' } })
    expect((await texts()).at(-1)).toMatchObject({ to: '+4915112345678' })
    expect(await contact.sendPhoneCode(null, form({ token: rental.token, phone: '+33699999999', changeCode: '00000000', locale: 'en' }))).toMatchObject({ ok: false, reason: 'wrong_code' })
    expect(await scoped((transaction) => renterContact(transaction, rental.rentalId))).toMatchObject({ phone: '+4915112345678', phoneConfirmed: true })
    expect(await contact.sendPhoneCode(null, form({ token: rental.token, phone: '+33699999999', changeCode: TEST_SIGN_IN_CODE, locale: 'en' }))).toMatchObject({ ok: true, value: { confirmed: false } })
    expect((await texts()).at(-1)).toMatchObject({ to: '+33699999999' })
    expect(await scoped((transaction) => renterContact(transaction, rental.rentalId))).toMatchObject({ phone: '+33699999999', phoneConfirmed: false })
  })

  it('may always go back to email', async () => {
    const rental = await shop.readyRental(1, confirmedAtCounter('+4915198765432'))
    jar.clear()
    expect(await contact.chooseEmail(null, form({ token: rental.token, locale: 'en' }))).toMatchObject({ ok: true })
    expect(await scoped((transaction) => renterContact(transaction, rental.rentalId))).toMatchObject({ channel: 'email' })
  })
})

describe('a demo shop', () => {
  it('shows the text on the renter’s page instead of sending it, labelled, with the code in it', async () => {
    const demo = await handoverShop(jar, 'owner@contact-demo.example', 'Demo Bikes', { demoSession: true })
    const before = (await texts()).length
    await demo.readyRental(1, async (token) => {
      const sent = await contact.sendPhoneCode(null, form({ token, phone: '+351912345678', changeCode: '', locale: 'en' }))
      expect(sent).toMatchObject({ ok: true, value: { confirmed: false, shown: expect.stringContaining(TEST_SIGN_IN_CODE) as unknown } })
    })
    expect((await texts()).length).toBe(before)
  })
})
