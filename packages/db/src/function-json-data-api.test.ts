import { RDSDataClient } from '@aws-sdk/client-rds-data'
import type { Field } from '@aws-sdk/client-rds-data'
import { describe, expect, it } from 'vitest'
import { publicShops, sessionByToken } from './assistant-repository.ts'
import { createDataApiDatabase } from './data-api.ts'
import { findRenterLink } from './renter-repository.ts'

const SETTINGS = { region: 'us-east-1', clusterArn: 'arn:aws:rds:us-east-1:111111111111:cluster:hold-test', secretArn: 'arn:aws:secretsmanager:us-east-1:111111111111:secret:hold/test', database: 'hold_db' }
const SHOP_ID = 'a81a2493-b3c9-48bf-addc-b572fa480b47'
const RENTAL_ID = '1b86cbe1-0416-4eda-a874-4550770dcdd4'

// Aurora answers every statement with these records, as the Data API sends them.
function auroraAnswering(record: Field[]) {
  const client = new RDSDataClient({ region: SETTINGS.region, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } })
  client.middlewareStack.add(
    (_next, context) => () => Promise.resolve({ response: {}, output: { $metadata: {}, ...(context.commandName === 'BeginTransactionCommand' ? { transactionId: 'json-test' } : { records: context.commandName === 'ExecuteStatementCommand' ? [record] : [], numberOfRecordsUpdated: 0 }) } }),
    { step: 'build', name: 'recordedAnswers' },
  )
  return createDataApiDatabase(SETTINGS, client)
}

// A jsonb value a function returns comes from Aurora as text. Read as it came, an assistant saw a shop's kinds as
// single characters, and a scope check became a search inside that text. Found on 27 October 2026 on the live MCP
// server, which answered find_shops with the kinds "[", "\"", "b", "i", "k", "e".
describe('jsonb read through a function on Aurora', () => {
  it('gives a shop\'s kinds as a list', async () => {
    const aurora = auroraAnswering([{ stringValue: SHOP_ID }, { stringValue: 'RO' }, { stringValue: 'ro' }, { stringValue: 'Europe/Zurich' }, { stringValue: 'CHF' }, { stringValue: '["bike"]' }])

    const [shop] = await publicShops(aurora, { place: null, kind: null, paypalMode: 'sandbox' })

    expect(shop?.kinds).toEqual(['bike'])
  })

  it('gives an agent session\'s scopes as a list', async () => {
    const aurora = auroraAnswering([{ stringValue: 'session-1' }, { stringValue: SHOP_ID }, { stringValue: RENTAL_ID }, { stringValue: '["rental","claim_reply"]' }, { stringValue: 'Claude' }, { stringValue: '2026-11-01 10:00:00' }, { isNull: true }])

    const session = await sessionByToken(aurora, 'fingerprint')

    expect(session?.scopes).toEqual(['rental', 'claim_reply'])
    expect(session?.scopes.includes('claim')).toBe(false)
  })

  it('gives a renter link\'s scopes as a list', async () => {
    const aurora = auroraAnswering([{ stringValue: 'link-1' }, { stringValue: SHOP_ID }, { stringValue: RENTAL_ID }, { stringValue: '["view","confirm_condition"]' }, { stringValue: '2026-11-01 10:00:00' }, { isNull: true }])

    const link = await findRenterLink(aurora, 'fingerprint')

    expect(link?.scopes).toEqual(['view', 'confirm_condition'])
    expect(link?.scopes.includes('condition')).toBe(false)
  })
})
