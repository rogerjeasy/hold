import { measureEvaluation } from '@hold/domain'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { acceptedEvalRun, gateRunHistory } from '../scorecard-repository.ts'
import { outsideShop } from '../scope.ts'
import { FIXTURE_CASES, recordFixtureEvalRuns } from './eval-fixture.ts'
import { createTestDatabase } from './test-database.ts'
import type { TestDatabase } from './test-database.ts'

// The made-up runs the open scorecard's end-to-end tests read, in the test environment only.
let database: TestDatabase
beforeAll(async () => { database = await createTestDatabase() })
afterAll(async () => { await database.$client.close() })

describe('the open scorecard’s fixture', () => {
  it('records an earlier run and an accepted one whose figures are measured from its own pairs, which cover every group', async () => {
    await recordFixtureEvalRuns(database, new Date('2026-11-05T10:00:00Z'))
    const run = await outsideShop(database, acceptedEvalRun)
    expect(run?.cases).toEqual(FIXTURE_CASES)
    expect(run?.measures).toEqual(measureEvaluation(FIXTURE_CASES))
    expect(new Set(FIXTURE_CASES.map((each) => each.group)).size).toBe(6)
    expect((await outsideShop(database, gateRunHistory)).length).toBe(2)
  })
})
