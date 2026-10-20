import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { claimDeadlineAction } from './claim-deadline.ts'
const validity = new Date('2026-11-18T09:00:00Z')
describe('claim deadlines', () => {
  it('waits for the reply period or protects a still-open approved claim one day before expiry', () => {
    const reply = new Date('2026-11-19T09:00:00Z')
    expect(claimDeadlineAction('presented', reply, validity, new Date('2026-11-16T09:00:00Z'))).toBe('wait')
    expect(claimDeadlineAction('presented', reply, validity, new Date('2026-11-17T09:00:00Z'))).toBe('protect')
    expect(claimDeadlineAction('contested', reply, validity, new Date('2026-11-17T09:00:00Z'))).toBe('wait')
  })
  it('never protects a claim before the final day', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100000000 }), (milliseconds) => {
      expect(claimDeadlineAction('presented', new Date(validity.getTime() + 86400000), validity, new Date(validity.getTime() - 86400000 - milliseconds))).toBe('wait')
    }))
  })
})
it('keeps a protective charge open for one reply, and rejects expired or already answered claims', async () => {
  const { claimReplyAllowed } = await import('./claim-deadline.ts')
  expect(claimReplyAllowed('charged', validity, new Date('2026-11-17T10:00:00Z'), true, false)).toBe(true)
  expect(claimReplyAllowed('charged', validity, validity, true, false)).toBe(false)
  expect(claimReplyAllowed('charged', validity, new Date('2026-11-17T10:00:00Z'), true, true)).toBe(false)
})
