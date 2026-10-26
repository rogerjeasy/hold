import { RDSDataClient } from '@aws-sdk/client-rds-data'
import type { ExecuteStatementCommandInput } from '@aws-sdk/client-rds-data'
import { expect, it } from 'vitest'
import { itemsStillFree } from './booking-repository.ts'
import { createDataApiDatabase } from './data-api.ts'

const SETTINGS = { region: 'us-east-1', clusterArn: 'arn:aws:rds:us-east-1:111111111111:cluster:hold-test', secretArn: 'arn:aws:secretsmanager:us-east-1:111111111111:secret:hold/test', database: 'hold_db' }
const RENTAL_ID = '1cbfb86a-44a8-45cc-80e0-8d281c1e7e8f'
const ITEM_ID = 'ab5f46e6-b1bd-4f31-9d67-da61c0f9c18e'

// Aurora compares a uuid column only with a uuid parameter. The in-memory PostgreSQL the other tests use casts a text
// parameter silently, so only the statements the Data API driver sends show the difference. Found on 26 October 2026
// when a renter paid a fee after the booking's fifteen minutes had passed.
it('sends the rental compared against its items as a uuid, as Aurora requires', async () => {
  const statements: ExecuteStatementCommandInput[] = []
  const answers = [
    [[{ stringValue: '2026-10-26 22:00:00' }, { stringValue: '2026-10-27 22:00:00' }]],
    [[{ stringValue: ITEM_ID }]],
    [],
  ]
  const client = new RDSDataClient({ region: SETTINGS.region, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } })
  client.middlewareStack.add(
    (_next, context) => (args) => {
      if (context.commandName === 'BeginTransactionCommand') return Promise.resolve({ response: {}, output: { $metadata: {}, transactionId: 'booking-test' } })
      if (context.commandName === 'ExecuteStatementCommand') statements.push(args.input as ExecuteStatementCommandInput)
      return Promise.resolve({ response: {}, output: { $metadata: {}, records: context.commandName === 'ExecuteStatementCommand' ? (answers.shift() ?? []) : [], numberOfRecordsUpdated: 0 } })
    },
    { step: 'build', name: 'recordedAnswers' },
  )
  const aurora = createDataApiDatabase(SETTINGS, client)

  expect(await aurora.transaction((transaction) => itemsStillFree(transaction, RENTAL_ID, new Date('2026-10-26T21:30:00Z')))).toBe(true)

  const others = statements.find((statement) => statement.sql?.includes('<>'))
  const rentalParameter = others?.parameters?.find((parameter) => parameter.value?.stringValue === RENTAL_ID)
  expect(rentalParameter?.typeHint).toBe('UUID')
})
