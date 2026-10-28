import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

// A throwaway spike for docs/tech-stack.md section 16: may Hold act for a shop through PayPal's partner model in the
// sandbox, so a shop connects with one PayPal sign-in instead of pasting a REST app's secret? Three steps:
//   refer     creates a seller referral (Partner Referrals v2) and prints its onboarding link
//   status    once a sandbox business account has onboarded through the link, reads the seller's integration back
//   pay       places a hold paid to that seller (payee.merchant_id) with partner attribution, then voids it
// It calls the REST API directly, as Hold's client does not send partner headers yet. Recorded in recordings/.

const BASE = 'https://api-m.sandbox.paypal.com'
const STATE = join(import.meta.dirname, 'recordings', 'partner-state.json')
const ATTRIBUTION = 'HOLD_SP_TRIAL'
type State = { readonly trackingId: string; readonly partnerMerchantId: string; readonly sellerMerchantId?: string }

const clientId = process.env['PAYPAL_SANDBOX_CLIENT_ID'] ?? ''
const clientSecret = process.env['PAYPAL_SANDBOX_CLIENT_SECRET'] ?? ''
if (clientId === '' || clientSecret === '') throw new Error('PAYPAL_SANDBOX_CLIENT_ID and PAYPAL_SANDBOX_CLIENT_SECRET must be set.')
const exchanges: unknown[] = []
const checks: { name: string; passed: boolean; observed: string }[] = []

async function token(): Promise<string> {
  const reply = await fetch(`${BASE}/v1/oauth2/token`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' })
  const body = (await reply.json()) as { access_token?: string }
  if (body.access_token === undefined) throw new Error(`No token: ${String(reply.status)}`)
  return body.access_token
}

async function call(method: 'GET' | 'POST', path: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await fetch(`${BASE}${path}`, { method, headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json', 'paypal-request-id': randomUUID(), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  const parsed = (text === '' ? {} : JSON.parse(text)) as Record<string, unknown>
  exchanges.push({ method, path, status: reply.status, debugId: reply.headers.get('paypal-debug-id'), request: body, reply: parsed })
  console.log(`    ${method} ${path} -> ${String(reply.status)} ${reply.headers.get('paypal-debug-id') ?? ''}`)
  return { status: reply.status, body: parsed }
}

function check(name: string, passed: boolean, observed: string) {
  checks.push({ name, passed, observed })
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}\n        ${observed}`)
}

const linkOf = (body: Record<string, unknown>, rel: string) => (body['links'] as { rel: string; href: string }[] | undefined)?.find((link) => link.rel === rel)?.href
const step = process.argv[2]

if (step === 'refer') {
  // The app's own merchant ID, as PayPal names the payee of an order it creates.
  const probe = await call('POST', '/v2/checkout/orders', { intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'EUR', value: '1.00' } }] })
  const partnerMerchantId = ((probe.body['purchase_units'] as { payee?: { merchant_id?: string } }[] | undefined)?.[0]?.payee?.merchant_id) ?? ''
  check('The app names its own merchant ID', partnerMerchantId !== '', partnerMerchantId)
  const trackingId = `hold-trial-${randomUUID().slice(0, 8)}`
  const referral = await call('POST', '/v2/customer/partner-referrals', {
    tracking_id: trackingId,
    operations: [{ operation: 'API_INTEGRATION', api_integration_preference: { rest_api_integration: { integration_method: 'PAYPAL', integration_type: 'THIRD_PARTY', third_party_details: { features: ['PAYMENT', 'REFUND', 'ACCESS_MERCHANT_INFORMATION', 'READ_SELLER_DISPUTE', 'UPDATE_SELLER_DISPUTE'] } } } }],
    products: ['EXPRESS_CHECKOUT'],
    legal_consents: [{ type: 'SHARE_DATA_CONSENT', granted: true }],
    partner_config_override: { return_url: 'https://example.com/hold/onboarded' },
  })
  const actionUrl = linkOf(referral.body, 'action_url')
  check('The sandbox makes a seller referral for this app', referral.status === 201 && actionUrl !== undefined, `${String(referral.status)} ${actionUrl ?? JSON.stringify(referral.body).slice(0, 300)}`)
  await mkdir(join(import.meta.dirname, 'recordings'), { recursive: true })
  await writeFile(STATE, JSON.stringify({ trackingId, partnerMerchantId } satisfies State, null, 2))
  if (actionUrl !== undefined) console.log(`\nOnboard a sandbox business account through this link, then run the status step:\n  ${actionUrl}\n`)
} else if (step === 'status') {
  const state = JSON.parse(await readFile(STATE, 'utf8')) as State
  const found = await call('GET', `/v1/customer/partners/${state.partnerMerchantId}/merchant-integrations?tracking_id=${state.trackingId}`)
  const sellerMerchantId = typeof found.body['merchant_id'] === 'string' ? found.body['merchant_id'] : undefined
  check('The onboarded seller is found by the tracking ID', sellerMerchantId !== undefined, `${String(found.status)} ${sellerMerchantId ?? JSON.stringify(found.body).slice(0, 300)}`)
  if (sellerMerchantId !== undefined) {
    const seller = await call('GET', `/v1/customer/partners/${state.partnerMerchantId}/merchant-integrations/${sellerMerchantId}`)
    check('The seller can be paid and gave the permissions asked for', seller.body['payments_receivable'] === true, JSON.stringify({ payments_receivable: seller.body['payments_receivable'], primary_email_confirmed: seller.body['primary_email_confirmed'], oauth_integrations: seller.body['oauth_integrations'] }).slice(0, 500))
    await writeFile(STATE, JSON.stringify({ ...state, sellerMerchantId } satisfies State, null, 2))
  }
} else if (step === 'pay') {
  const state = JSON.parse(await readFile(STATE, 'utf8')) as State
  if (state.sellerMerchantId === undefined) throw new Error('Run the status step first.')
  const order = await call('POST', '/v2/checkout/orders', { intent: 'AUTHORIZE', purchase_units: [{ amount: { currency_code: 'EUR', value: '5.00' }, payee: { merchant_id: state.sellerMerchantId }, description: 'Hold trial. A hold paid to the shop itself.' }], payment_source: { paypal: { experience_context: { user_action: 'CONTINUE', return_url: 'https://example.com/hold/approved', cancel_url: 'https://example.com/hold/cancelled' } } } }, { 'paypal-partner-attribution-id': ATTRIBUTION })
  const orderId = typeof order.body['id'] === 'string' ? order.body['id'] : ''
  check('An authorize-first order is made for the seller, with partner attribution', order.status === 201 || order.status === 200, `${String(order.status)} ${orderId}`)
  console.log(`\nApprove this order with a sandbox personal account:\n  ${linkOf(order.body, 'payer-action') ?? linkOf(order.body, 'approve') ?? 'no link'}\n`)
  for (let tries = 0; tries < 300; tries += 1) {
    const read = await call('GET', `/v2/checkout/orders/${orderId}`)
    if (read.body['status'] === 'APPROVED') break
    await wait(3000)
  }
  const authorized = await call('POST', `/v2/checkout/orders/${orderId}/authorize`, {}, { 'paypal-partner-attribution-id': ATTRIBUTION })
  const authorization = ((authorized.body['purchase_units'] as { payments?: { authorizations?: { id: string; status: string }[] } }[] | undefined)?.[0]?.payments?.authorizations?.[0])
  check('The partner authorizes the hold for the seller', authorization?.status === 'CREATED', JSON.stringify(authorization ?? authorized.body).slice(0, 300))
  if (authorization !== undefined) {
    const read = await call('GET', `/v2/payments/authorizations/${authorization.id}`)
    check('The hold is held for the seller', (read.body['payee'] as { merchant_id?: string } | undefined)?.merchant_id === state.sellerMerchantId, JSON.stringify(read.body['payee']))
    const voided = await call('POST', `/v2/payments/authorizations/${authorization.id}/void`, {}, { 'paypal-partner-attribution-id': ATTRIBUTION })
    check('The partner voids the seller’s hold', voided.status === 204 || voided.status === 200, String(voided.status))
  }
} else if (step === 'pay-email') {
  // Without partner permissions: an order may name its payee by the shop's PayPal email alone. Does a hold placed that
  // way authorize, capture and void for the shop, with this app calling? PAYEE_EMAIL is a sandbox business account.
  const payeeEmail = process.env['PAYEE_EMAIL'] ?? ''
  if (payeeEmail === '') throw new Error('PAYEE_EMAIL must name a sandbox business account.')
  const order = await call('POST', '/v2/checkout/orders', { intent: 'AUTHORIZE', purchase_units: [{ amount: { currency_code: 'EUR', value: '5.00' }, payee: { email_address: payeeEmail }, description: 'Hold trial. A hold paid to the shop by its email.' }], payment_source: { paypal: { experience_context: { user_action: 'CONTINUE', return_url: 'https://example.com/hold/approved', cancel_url: 'https://example.com/hold/cancelled' } } } })
  const orderId = typeof order.body['id'] === 'string' ? order.body['id'] : ''
  check('An authorize-first order is made for the shop named by email', order.status === 201 || order.status === 200, `${String(order.status)} ${orderId} ${order.status >= 300 ? JSON.stringify(order.body).slice(0, 300) : ''}`)
  console.log(`\nApprove this order with a sandbox personal account:\n  ${linkOf(order.body, 'payer-action') ?? linkOf(order.body, 'approve') ?? 'no link'}\n`)
  for (let tries = 0; tries < 300; tries += 1) {
    const read = await call('GET', `/v2/checkout/orders/${orderId}`)
    if (read.body['status'] === 'APPROVED') break
    await wait(3000)
  }
  const authorized = await call('POST', `/v2/checkout/orders/${orderId}/authorize`, {})
  const authorization = ((authorized.body['purchase_units'] as { payments?: { authorizations?: { id: string; status: string }[] } }[] | undefined)?.[0]?.payments?.authorizations?.[0])
  check('This app authorizes the hold for the shop', authorization?.status === 'CREATED', JSON.stringify(authorization ?? authorized.body).slice(0, 300))
  if (authorization !== undefined) {
    const read = await call('GET', `/v2/payments/authorizations/${authorization.id}`)
    check('The hold reads back as held for the shop', read.status === 200, JSON.stringify({ status: read.body['status'], payee: read.body['payee'] }).slice(0, 300))
    const captured = await call('POST', `/v2/payments/authorizations/${authorization.id}/capture`, { amount: { currency_code: 'EUR', value: '1.00' }, final_capture: false })
    check('This app captures part of the shop’s hold', captured.status === 201 || captured.status === 200, `${String(captured.status)} ${JSON.stringify(captured.body).slice(0, 300)}`)
    const voided = await call('POST', `/v2/payments/authorizations/${authorization.id}/void`, {})
    check('This app voids the rest of the shop’s hold', voided.status === 204 || voided.status === 200, `${String(voided.status)} ${JSON.stringify(voided.body).slice(0, 300)}`)
  }
} else {
  throw new Error('Say which step: refer, status, pay, pay-email.')
}

const file = join(import.meta.dirname, 'recordings', `partner-onboarding-${step}-${new Date().toISOString().replaceAll(':', '-')}.json`)
await writeFile(file, JSON.stringify({ step, checks, exchanges }, null, 2))
console.log(`\n${String(checks.filter((each) => each.passed).length)} of ${String(checks.length)} checks passed. Recorded in ${file}`)
