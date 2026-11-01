import { inShop, recordText, textsOf } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import { readyRentalShop } from '@hold/db/testing/ready-rental'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recordTextReport, textReportSchema } from './text-report.ts'

const NOW = new Date('2026-11-02T10:00:00Z')
let database: Awaited<ReturnType<typeof createTestDatabase>>
let shop: Awaited<ReturnType<typeof readyRentalShop>>
let other: Awaited<ReturnType<typeof readyRentalShop>>
beforeAll(async () => { database = await createTestDatabase(); shop = await readyRentalShop(database, 'text-report', NOW); other = await readyRentalShop(database, 'text-report-other', NOW) })
afterAll(async () => { await database.$client.close() })

// What AWS End User Messaging's event destination sends for a text, as the queue receives it.
const report = (overrides: Record<string, unknown>) => ({ eventType: 'TEXT_DELIVERED', eventVersion: '1.0', eventTimestamp: NOW.getTime() + 4000, isFinal: true, messageId: 'aws-1', destinationPhoneNumber: '+41791234567', messageStatus: 'DELIVERED', ...overrides })

async function sentText(messageId: string) {
  const rentalId = await shop.paidRental(`PAYER-${messageId}`)
  await shop.act((transaction) => recordText(transaction, { rentalId, purpose: 'renter_link', toPhone: '+41791234567', status: 'sent', providerMessageId: messageId, body: null, failure: null }, NOW))
  return rentalId
}
const statusOf = async (rentalId: string) => (await inShop(database, { role: 'hold_worker', shopId: shop.scope.shopId }, (transaction) => textsOf(transaction, rentalId)))[0]

describe('a delivery report from AWS', () => {
  it('marks the text delivered, at the time AWS gives, inside the shop the text carried as context', async () => {
    const rentalId = await sentText('aws-delivered')
    await recordTextReport(database, textReportSchema.parse(report({ messageId: 'aws-delivered', context: { shopId: shop.scope.shopId, rentalId } })))
    expect(await statusOf(rentalId)).toMatchObject({ status: 'delivered', statusAt: new Date(NOW.getTime() + 4000) })
  })

  it('marks a blocked or unreachable text failed, with the kind AWS gives', async () => {
    const rentalId = await sentText('aws-blocked')
    await recordTextReport(database, textReportSchema.parse(report({ messageId: 'aws-blocked', eventType: 'TEXT_CARRIER_UNREACHABLE', messageStatus: 'CARRIER_UNREACHABLE', context: { shopId: shop.scope.shopId, rentalId } })))
    expect(await statusOf(rentalId)).toMatchObject({ status: 'failed', failure: 'TEXT_CARRIER_UNREACHABLE' })
  })

  it('leaves the text as it is for a report on its way, or one naming another shop', async () => {
    const rentalId = await sentText('aws-queued')
    await recordTextReport(database, textReportSchema.parse(report({ messageId: 'aws-queued', eventType: 'TEXT_QUEUED', context: { shopId: shop.scope.shopId, rentalId } })))
    await recordTextReport(database, textReportSchema.parse(report({ messageId: 'aws-queued', context: { shopId: other.scope.shopId, rentalId } })))
    expect(await statusOf(rentalId)).toMatchObject({ status: 'sent' })
  })

  it('is not one of Hold’s without the shop and rental it carries as context', () => {
    expect(textReportSchema.safeParse(report({})).success).toBe(false)
    expect(textReportSchema.safeParse(report({ context: { shopId: 'not-a-shop', rentalId: 'x' } })).success).toBe(false)
  })
})
