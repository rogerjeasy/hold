// @vitest-environment node
import { inShop, renterContact } from '@hold/db'
import type { Text } from '@hold/notify'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// How a renter is reached, chosen on the phone app (architecture.md sections 12.3 and 13.8): the same server functions
// the renter's web page calls, through the phone's renter routes, with the test environment's texter and mailer.

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 13).toString('base64')
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: (name: string) => jar.has(name) ? { name, value: jar.get(name) } : undefined, set: (name: string, value: string) => jar.set(name, value), delete: (cookie: string | { name: string }) => jar.delete(typeof cookie === 'string' ? cookie : cookie.name) }), headers: () => Promise.resolve(new Headers()) }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('next-intl/server', () => ({ getTranslations: () => Promise.resolve((key: string) => key) }))
const { getServices, TEST_SIGN_IN_CODE } = await import('./services')
const { handoverShop } = await import('@/test/ready-rental')
const { rawAction, renterPhone } = await import('@/test/mobile-renter')

vi.setConfig({ testTimeout: 60_000 })

let shop: Awaited<ReturnType<typeof handoverShop>>
const texts = async () => ((await getServices()).texter as unknown as { sent: readonly Text[] }).sent
const scoped = async <Result>(work: Parameters<typeof inShop<Result>>[2]) => inShop((await getServices()).database, { role: 'hold_app', shopId: shop.shopId }, work)

beforeAll(async () => {
  shop = await handoverShop(jar, 'owner@phone-contact.example', 'Phone Contact Bikes')
})
beforeEach(() => { jar.clear() })

describe('choosing how Hold reaches the renter, on the phone', () => {
  it('chooses texts and confirms the number before the hold, sees it on the rental and the hold, and goes back to email', async () => {
    const rental = await shop.readyRental(1, async (token) => {
      const phone = renterPhone(token)
      expect(await phone.view('rental')).toMatchObject({ ok: true, value: { contact: { channel: 'email', phone: null, confirmed: false, locked: false, shown: [] } } })
      expect(await phone.act('send-phone-code', { phone: '079 123 45 67', changeCode: '' })).toEqual({ ok: false, failure: 'refused', reason: 'phone_invalid' })
      expect(await phone.act('send-phone-code', { phone: '+41 79 123 45 67', changeCode: '' })).toEqual({ ok: true, value: { phone: '+41 ••• •• 67', confirmed: false, shown: null } })
      expect((await texts()).at(-1)).toMatchObject({ to: '+41791234567' })
      expect(await phone.act('confirm-phone', { code: '00000000' })).toEqual({ ok: false, failure: 'refused', reason: 'wrong_code' })
      expect(await phone.act('confirm-phone', { code: TEST_SIGN_IN_CODE })).toEqual({ ok: true, value: { phone: '+41 ••• •• 67' } })
      expect(await phone.view('hold')).toMatchObject({ ok: true, value: { contact: { channel: 'text', phone: '+41 ••• •• 67', confirmed: true, locked: false } } })
    })
    jar.clear()
    const phone = renterPhone(rental.token)
    expect(await phone.view('rental')).toMatchObject({ ok: true, value: { contact: { channel: 'text', phone: '+41 ••• •• 67', confirmed: true, locked: true } } })
    // The number in full never leaves the server.
    expect(JSON.stringify(await phone.view('rental'))).not.toContain('791234567')
    expect(await phone.act('choose-email', {})).toEqual({ ok: true, value: { channel: 'email' } })
    expect(await scoped((transaction) => renterContact(transaction, rental.rentalId))).toMatchObject({ channel: 'email' })
  })

  it('changes the number after the hold only with the code sent where the codes go now', async () => {
    const rental = await shop.readyRental(1, async (token) => {
      await renterPhone(token).act('send-phone-code', { phone: '+4915112345678', changeCode: '' })
      await renterPhone(token).act('confirm-phone', { code: TEST_SIGN_IN_CODE })
    })
    jar.clear()
    const phone = renterPhone(rental.token)
    expect(await phone.act('send-phone-code', { phone: '+33699999999', changeCode: '' })).toEqual({ ok: false, failure: 'refused', reason: 'code_needed' })
    expect(await phone.act('send-contact-change-code', {})).toEqual({ ok: true, value: { via: 'text', phone: '+49 ••• •• 78', sandboxContact: false, shown: null } })
    expect((await texts()).at(-1)).toMatchObject({ to: '+4915112345678' })
    expect(await phone.act('send-phone-code', { phone: '+33699999999', changeCode: '00000000' })).toEqual({ ok: false, failure: 'refused', reason: 'wrong_code' })
    expect(await phone.act('send-phone-code', { phone: '+33699999999', changeCode: TEST_SIGN_IN_CODE })).toMatchObject({ ok: true, value: { confirmed: false } })
    expect((await texts()).at(-1)).toMatchObject({ to: '+33699999999' })
    expect(await phone.view('rental')).toMatchObject({ ok: true, value: { contact: { phone: '+33 ••• •• 99', confirmed: false, locked: true } } })
  })

  it('refuses a malformed code, and a field the action does not take', async () => {
    const rental = await shop.readyRental()
    const authorization = `Bearer ${rental.token}`
    expect(await (await rawAction('confirm-phone', { authorization, body: JSON.stringify({ code: '1234' }) })).json()).toEqual({ ok: false, failure: 'invalid', fields: ['code'] })
    expect((await rawAction('choose-email', { authorization, body: JSON.stringify({ phone: '+33699999999' }) })).status).toBe(400)
  })
})

describe('a demo shop, on the phone', () => {
  it('shows the text it did not send, with the code in it, and lists it on the rental', async () => {
    const demo = await handoverShop(jar, 'owner@phone-contact-demo.example', 'Phone Demo Bikes', { demoSession: true })
    const before = (await texts()).length
    await demo.readyRental(1, async (token) => {
      const phone = renterPhone(token)
      expect(await phone.act('send-phone-code', { phone: '+351912345678', changeCode: '' })).toMatchObject({ ok: true, value: { confirmed: false, shown: expect.stringContaining(TEST_SIGN_IN_CODE) as unknown } })
      expect(await phone.view('rental')).toMatchObject({ ok: true, value: { contact: { shown: [{ id: expect.any(String) as unknown, body: expect.stringContaining(TEST_SIGN_IN_CODE) as unknown }] } } })
    })
    expect((await texts()).length).toBe(before)
  })
})
