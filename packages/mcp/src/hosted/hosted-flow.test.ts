import { money } from '@hold/domain'
import { beginFeeCapture, confirmFeeCapture, inShop, rentals, savePayPalAccount, sessionByBookingSecret } from '@hold/db'
import type { Scope } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import type { TestDatabase } from '@hold/db/testing'
import { readyRentalShop } from '@hold/db/testing/ready-rental'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { readSecret } from '../secrets.ts'
import { connectClient, TEST_SECRET, testPorts } from '../testing.ts'
import type { Conversation } from './model.ts'
import { runHostedTurn } from './runner.ts'
import { createScriptedModel } from './scripted-model.ts'

// The hosted assistant's flow (extensions.md section 8.11, "two clients"): its scripted stand-in, through the runner,
// as an MCP client of Hold's own server, books and follows a rental the way any outside assistant would.

let database: TestDatabase
let shop: Scope

const say = (conversation: Conversation, text: string): Conversation => [...conversation, { role: 'user', content: [{ type: 'text', text }] }]

beforeAll(async () => {
  database = await createTestDatabase()
  shop = (await readyRentalShop(database, 'hosted', new Date())).scope
  await inShop(database, shop, (transaction) => savePayPalAccount(transaction, shop.shopId, 'sandbox', 'hold/paypal/shops/hosted/sandbox'))
})

describe('the hosted assistant, as a client of Hold’s MCP server', () => {
  it('quotes from Hold’s results, books when told to, hands over PayPal’s link, and follows the payment', async () => {
    const client = await connectClient(testPorts(database), '203.0.113.90', 'Hold hosted assistant')
    const model = createScriptedModel(() => new Date())
    const turn = (conversation: Conversation) => runHostedTurn({ model, client, conversation, now: () => new Date(), today: new Date().toISOString().slice(0, 10) })

    const quoted = await turn(say([], 'Book me an e-bike for three days.'))
    expect(quoted).toMatchObject({ stopped: 'done', simulated: true, approvalUrl: null })
    expect(quoted.toolCalls).toEqual([
      { name: 'find_shops', ok: true },
      { name: 'check_availability', ok: true },
      { name: 'get_damage_prices', ok: true },
      { name: 'quote_rental', ok: true },
    ])
    // Every amount is copied from Hold's results: three days at €40.00, the €300.00 hold, the €35.00 scratch.
    expect(quoted.reply).toContain('€120.00')
    expect(quoted.reply).toContain('€300.00')
    expect(quoted.reply).toContain('€35.00')

    const booked = await turn(say(quoted.conversation, 'Yes, book it.'))
    expect(booked.toolCalls).toEqual([{ name: 'create_booking', ok: true }])
    expect(booked.approvalUrl).toMatch(/^https:\/\/paypal\.example\/checkoutnow\?token=ORDER-/)
    expect(booked.reply).not.toMatch(/hbs_/)

    const waiting = await turn(say(booked.conversation, 'Is it paid?'))
    expect(waiting.toolCalls).toEqual([{ name: 'get_booking', ok: true }])
    expect(waiting.reply).toMatch(/not paid yet/i)

    const secret = booked.conversation.flatMap((message) => message.content).flatMap((block) => (block.type === 'tool_result' ? [block.content] : [])).map((content) => JSON.parse(content) as Record<string, unknown>).find((result) => typeof result['booking_secret'] === 'string')?.['booking_secret']
    const session = await sessionByBookingSecret(database, readSecret(TEST_SECRET, 'booking_secret', String(secret)) ?? '')
    const rentalId = session?.rentalId ?? ''
    const fee = await inShop(database, shop, (transaction) => beginFeeCapture(transaction, rentalId, new Date()))
    if (!fee.ok) throw new Error(fee.reason)
    const [rental] = await inShop(database, shop, (transaction) => transaction.select().from(rentals).where(eq(rentals.id, rentalId)))
    await inShop(database, shop, (transaction) =>
      confirmFeeCapture(transaction, fee.execution.id, { orderId: rental?.paypalFeeOrderId ?? '', captureId: 'CAPTURE-HOSTED', status: 'completed', amount: money(rental?.feeCents ?? 0, 'EUR'), payer: { payerId: 'PAYER-HOSTED', email: 'judge@example.com', name: 'Judge' } }, new Date()),
    )
    const paid = await turn(say(waiting.conversation, 'I approved it in PayPal.'))
    expect(paid.reply).toMatch(/booked/i)
    expect(paid.reply).not.toMatch(/hat_/)
  })

  it('looks for the shop or the place the person names', async () => {
    const client = await connectClient(testPorts(database), '203.0.113.92', 'Hold hosted assistant')
    const run = (text: string) => runHostedTurn({ model: createScriptedModel(() => new Date()), client, conversation: say([], text), now: () => new Date(), today: '2026-10-30' })
    expect((await run('An e-bike at Shop hosted, please.')).toolCalls.map((call) => call.name)).toContain('quote_rental')
    expect((await run('An e-bike in Reykjavik, please.')).reply).toMatch(/no shop/i)
  })

  it('reports Hold’s refusal in plain words and stops', async () => {
    const client = await connectClient(testPorts(database), '203.0.113.91', 'Hold hosted assistant')
    const result = await runHostedTurn({ model: createScriptedModel(() => new Date()), client, conversation: say([], 'Rent me a kayak.'), now: () => new Date(), today: '2026-10-30' })
    expect(result.toolCalls).toEqual([{ name: 'find_shops', ok: true }])
    expect(result.reply).toMatch(/no shop/i)
  })
})
