// @vitest-environment node
import { findPayPalAccount, inShop, registerOwner, savePayPalAccount } from '@hold/db'
import { describe, expect, it, vi } from 'vitest'

process.env['HOLD_ENVIRONMENT'] = 'test'
process.env['HOLD_COOKIE_KEY'] = Buffer.alloc(32, 5).toString('base64')

const { getServices, DEMO_PAYPAL_REFERENCE } = await import('./services')
const { subscribeToPayPal } = await import('./paypal-subscription')

vi.setConfig({ testTimeout: 60_000 })

// Every demo shop shares one sandbox app (architecture.md section 20.3). PayPal allows an app ten webhook addresses, and
// sends each of them every event of the app, so a demo shop never subscribes one of its own.
describe('subscribing a shop’s webhook address', () => {
  it('subscribes a shop connected with its own credentials', async () => {
    const { database } = await getServices()
    const shop = await registerOwner(database, { subject: 'own-credentials', email: 'own@shop.example', name: 'Ana', language: 'en', shop: { name: 'Douro Bikes', timeZone: 'Europe/Lisbon' } })
    const scope = { role: 'hold_app' as const, shopId: shop.shopId, userId: shop.userId }
    await inShop(database, scope, (transaction) => savePayPalAccount(transaction, shop.shopId, 'sandbox', `hold/paypal/shops/${shop.shopId}/sandbox`))

    expect(await inShop(database, scope, (transaction) => subscribeToPayPal(transaction, shop.shopId))).toBe(true)
  })

  it('refuses a shop that shares the demo’s sandbox connection, and keeps no subscription for it', async () => {
    const services = await getServices()
    const sessions = services.demoSessions
    if (sessions === undefined) throw new Error('The test environment has demo sessions.')
    const opened = await sessions.open({
      owner: { subject: 'demo-owner-subscribe', email: 'tomas.subscrib@demo.hold.example' },
      staff: { subject: 'demo-staff-subscribe', email: 'jonas.subscrib@demo.hold.example' },
      slug: 'ribeira-bikes-subscrib',
      paypal: { credentialReference: DEMO_PAYPAL_REFERENCE, mode: 'sandbox' },
      now: new Date(),
    })
    const scope = { role: 'hold_app' as const, shopId: opened.shopId }

    expect(await inShop(services.database, scope, (transaction) => subscribeToPayPal(transaction, opened.shopId))).toBe(false)
    expect((await inShop(services.database, scope, (transaction) => findPayPalAccount(transaction, opened.shopId, 'sandbox')))?.webhookId).toBeNull()
  })
})
