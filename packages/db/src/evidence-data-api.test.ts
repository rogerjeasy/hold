import { RDSDataClient } from '@aws-sdk/client-rds-data'
import { expect, it } from 'vitest'
import { createDataApiDatabase } from './data-api.ts'
import { reserveEvidencePack } from './evidence-repository.ts'
import { evidenceSnapshot } from './evidence-snapshot.ts'
import { readyRentalShop } from './testing/ready-rental.ts'
import { createTestDatabase } from './testing/test-database.ts'

it('decodes Aurora JSON fields before validating the complete evidence snapshot', async () => {
  const database = await createTestDatabase()
  try {
    const shop = await readyRentalShop(database, 'data-api-record', new Date('2026-10-20T12:00:00Z'))
    const rental = await shop.readyRental()
    const pack = await shop.act((transaction) => reserveEvidencePack(transaction, rental.rentalId, new Date('2026-10-20T12:00:00Z')))
    if (pack === undefined) throw new Error('No source snapshot')
    const snapshot = pack.snapshot
    // Aurora sends JSONB expressions as stringValue. The real Drizzle driver leaves untyped SQL fields as strings.
    const jsonFields = [snapshot.shop, snapshot.rental, snapshot.agreement, snapshot.items, snapshot.comparisons, snapshot.claim, snapshot.approvals, snapshot.replies, snapshot.payments, snapshot.invoices, snapshot.authorizations]
    const records = [[{ longValue: 1 }, ...jsonFields.map((value) => ({ stringValue: JSON.stringify(value) })), { isNull: true }]]
    const client = new RDSDataClient({ region: 'us-east-1', credentials: { accessKeyId: 'test', secretAccessKey: 'test' } })
    client.middlewareStack.add((_next, context) => () => Promise.resolve({ response: {}, output: { $metadata: {}, ...(context.commandName === 'BeginTransactionCommand' ? { transactionId: 'snapshot-test' } : { records, numberOfRecordsUpdated: 0 }) } }), { step: 'build', name: 'recordedSnapshotResponse' })
    const aurora = createDataApiDatabase({ region: 'us-east-1', clusterArn: 'arn:aws:rds:us-east-1:111111111111:cluster:test', secretArn: 'arn:aws:secretsmanager:us-east-1:111111111111:secret:test', database: 'hold_db' }, client)
    expect(await aurora.transaction((transaction) => evidenceSnapshot(transaction, rental.rentalId))).toEqual(snapshot)
  } finally { await database.$client.close() }
})
