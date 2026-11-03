import { describe, expect, it } from 'vitest'
import { EVIDENCE_KEPT_DAYS, EVIDENCE_LOCK_DAYS, PAYPAL_DISPUTE_DAYS } from './data-retention.ts'
import { HOLD_VALIDITY_DAYS } from './hold-clocks.ts'

describe('how long evidence is kept', () => {
  it('locks a photograph for as long as PayPal accepts a dispute after a payment', () => {
    expect(EVIDENCE_LOCK_DAYS).toBeGreaterThanOrEqual(PAYPAL_DISPUTE_DAYS)
  })

  it('never deletes a photograph before its lock ends', () => {
    expect(EVIDENCE_KEPT_DAYS).toBeGreaterThanOrEqual(EVIDENCE_LOCK_DAYS)
  })

  it('keeps it until a dispute can no longer be opened against the latest charge a hold allows', () => {
    // The last capture comes no later than the hold's life after the handover photographs, and a dispute may follow it.
    expect(EVIDENCE_KEPT_DAYS).toBeGreaterThanOrEqual(HOLD_VALIDITY_DAYS + PAYPAL_DISPUTE_DAYS)
  })
})
