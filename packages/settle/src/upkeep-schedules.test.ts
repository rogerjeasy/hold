import type { Database } from '@hold/db'
import { describe, expect, it } from 'vitest'
import type { QueueMessage, SettleDependencies } from './dependencies.ts'
import { createMemoryScheduler } from './memory-scheduler.ts'
import { scheduleUpkeep } from './upkeep-schedules.ts'

const NOW = new Date('2026-11-12T09:00:00Z')

function dependencies() {
  const sent: QueueMessage[] = []
  const scheduler = createMemoryScheduler()
  const value: SettleDependencies = {
    database: {} as Database,
    paypalFor: () => {
      throw new Error('Not used.')
    },
    paypalMode: 'sandbox',
    send: (message) => Promise.resolve(void sent.push(message)),
    scheduler,
    notifier: { tell: () => Promise.resolve() },
    renterAsk: { approval: () => Promise.reject(new Error('Not asked here.')) },
    now: () => NOW,
  }
  return { value, sent, scheduler }
}

describe('scheduling a hold’s upkeep', () => {
  it('schedules both steps while they are still ahead', async () => {
    const { value, sent, scheduler } = dependencies()
    await scheduleUpkeep(value, 'shop-1', { holdId: 'hold-1', authorizationId: 'auth-1', startReplacementAt: new Date('2026-11-20T09:00:00Z'), expiresAt: new Date('2026-11-23T09:00:00Z') })
    expect(scheduler.scheduled().map((work) => work.name)).toEqual(['hold-replace-auth-1', 'hold-expire-auth-1'])
    expect(sent).toEqual([])
  })

  it('sends a step whose time has passed to its queue at once, since a schedule in the past never fires', async () => {
    const { value, sent, scheduler } = dependencies()
    await scheduleUpkeep(value, 'shop-1', { holdId: 'hold-1', authorizationId: 'auth-1', startReplacementAt: new Date('2026-11-10T09:00:00Z'), expiresAt: new Date('2026-11-13T09:00:00Z') })
    expect(sent).toEqual([{ queue: 'upkeep', group: 'hold-1', deduplicationId: 'hold-replace-auth-1', body: { shopId: 'shop-1', holdId: 'hold-1', authorizationId: 'auth-1', kind: 'replace' } }])
    expect(scheduler.scheduled().map((work) => work.name)).toEqual(['hold-expire-auth-1'])
  })
})
