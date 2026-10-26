import { RDSDataClient } from '@aws-sdk/client-rds-data'
import { expect, it } from 'vitest'
import { createDataApiDatabase } from './data-api.ts'
import { pendingOutbox } from './paypal-event-repository.ts'

const SETTINGS = { region: 'us-east-1', clusterArn: 'arn:aws:rds:us-east-1:111111111111:cluster:hold-test', secretArn: 'arn:aws:secretsmanager:us-east-1:111111111111:secret:hold/test', database: 'hold_db' }
const SHOP_ID = '0b0f6c55-1a37-4a7e-9a59-3f8f1b0c2d11'
const PACK_ID = '6a1d1f0e-5a43-4cbe-8a0e-2a8f0a6e9b77'

// Aurora sends a jsonb column read through raw SQL as text. Spread as it came, the relay sent the worker an object
// keyed "0", "1" and so on, which the evidence worker rightly dropped: no evidence pack made at settlement was ever
// built. Found on 26 October 2026 in the evidence worker's log.
it('reads a waiting message from Aurora with its payload as an object', async () => {
  const records = [[{ stringValue: 'message-1' }, { stringValue: SHOP_ID }, { stringValue: 'evidence' }, { stringValue: 'rental-1' }, { stringValue: JSON.stringify({ packId: PACK_ID }) }]]
  const client = new RDSDataClient({ region: SETTINGS.region, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } })
  client.middlewareStack.add(
    (_next, context) => () => Promise.resolve({ response: {}, output: { $metadata: {}, ...(context.commandName === 'BeginTransactionCommand' ? { transactionId: 'outbox-test' } : { records: context.commandName === 'ExecuteStatementCommand' ? records : [], numberOfRecordsUpdated: 0 }) } }),
    { step: 'build', name: 'recordedAnswers' },
  )
  const aurora = createDataApiDatabase(SETTINGS, client)

  const [message] = await pendingOutbox(aurora, 10)

  expect(message?.payload).toEqual({ packId: PACK_ID })
})
