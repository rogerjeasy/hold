import { RDSDataClient } from '@aws-sdk/client-rds-data'
import type { ExecuteStatementCommandInput } from '@aws-sdk/client-rds-data'
import { expect, it } from 'vitest'
import { expireUnpaidAssistantBookings } from './assistant-repository.ts'
import { createDataApiDatabase } from './data-api.ts'

const SETTINGS = { region: 'us-east-1', clusterArn: 'arn:aws:rds:us-east-1:111111111111:cluster:hold-test', secretArn: 'arn:aws:secretsmanager:us-east-1:111111111111:secret:hold/test', database: 'hold_db' }

// Aurora compares a timestamp column only with a timestamp parameter: a date bound as plain text fails the whole
// statement. The in-memory PostgreSQL the other tests use casts it silently. Found on 28 October 2026, when every
// booking through the hosted assistant failed on the deployed app.
it('sends the lapse time of unpaid assistant bookings as a timestamp, as Aurora requires', async () => {
  const statements: ExecuteStatementCommandInput[] = []
  const client = new RDSDataClient({ region: SETTINGS.region, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } })
  client.middlewareStack.add(
    (_next, context) => (args) => {
      if (context.commandName === 'BeginTransactionCommand') return Promise.resolve({ response: {}, output: { $metadata: {}, transactionId: 'assistant-test' } })
      if (context.commandName === 'ExecuteStatementCommand') statements.push(args.input as ExecuteStatementCommandInput)
      return Promise.resolve({ response: {}, output: { $metadata: {}, records: [], numberOfRecordsUpdated: 0 } })
    },
    { step: 'build', name: 'recordedAnswers' },
  )
  const aurora = createDataApiDatabase(SETTINGS, client)

  expect(await aurora.transaction((transaction) => expireUnpaidAssistantBookings(transaction, new Date('2026-10-27T23:07:49Z')))).toBe(0)

  const update = statements.find((statement) => statement.sql?.includes('created_at'))
  const lapse = update?.parameters?.find((parameter) => parameter.value?.stringValue?.startsWith('2026-10-27'))
  expect(lapse?.typeHint).toBe('TIMESTAMP')
})
