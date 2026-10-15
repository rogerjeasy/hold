import { RDSDataClient } from '@aws-sdk/client-rds-data'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataApiDatabase } from './data-api.ts'

const SETTINGS = { region: 'us-east-1', clusterArn: 'arn:aws:rds:us-east-1:111111111111:cluster:hold-test', secretArn: 'arn:aws:secretsmanager:us-east-1:111111111111:secret:hold/test', database: 'hold_db' }

function resuming(): Error {
  const error = new Error('The Aurora DB instance is resuming after being auto-paused.')
  error.name = 'DatabaseResumingException'
  return error
}

// A client whose every call is answered here instead of by AWS: resuming for the given time, then an empty result.
// The client reads its configuration from disk before its first call, which a fake clock cannot hurry, so a test
// waits for that call before moving the clock.
function clientResumingFor(milliseconds: number, now: () => number) {
  const client = new RDSDataClient({ region: SETTINGS.region, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } })
  const awakeAt = now() + milliseconds
  let called: () => void = () => undefined
  const firstCall = new Promise<void>((resolve) => (called = resolve))
  client.middlewareStack.add(
    () => () => {
      called()
      if (now() < awakeAt) return Promise.reject(resuming())
      return Promise.resolve({ output: { $metadata: {}, records: [], numberOfRecordsUpdated: 0 }, response: {} })
    },
    { step: 'build', name: 'answerInsteadOfAws' },
  )
  return { client, firstCall }
}

describe('reaching Aurora through the Data API', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // A deploy on 15 October 2026 found the cluster still resuming after 68 seconds of trying.
  it('waits while a paused cluster takes two minutes to resume', async () => {
    const { client, firstCall } = clientResumingFor(120_000, Date.now)
    const database = createDataApiDatabase(SETTINGS, client)

    const query = Promise.resolve(database.execute(sql`select 1`))
    await firstCall
    await vi.advanceTimersByTimeAsync(130_000)

    await expect(query).resolves.toBeDefined()
  })

  it('gives up on a cluster that is still resuming after three minutes', async () => {
    const { client, firstCall } = clientResumingFor(600_000, Date.now)
    const database = createDataApiDatabase(SETTINGS, client)

    const query = Promise.resolve(database.execute(sql`select 1`))
    const outcome = expect(query).rejects.toThrow()
    await firstCall
    await vi.advanceTimersByTimeAsync(200_000)

    await outcome
  })
})
