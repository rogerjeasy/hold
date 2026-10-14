// The two clocks PayPal sets on every hold. Both run from the moment the authorization is created.

// Capture is best assured inside this period. After it, the hold should be renewed before a capture.
export const HOLD_ASSURED_DAYS = 3
// After this the authorization is gone. A renewal does not move it.
export const HOLD_VALIDITY_DAYS = 29

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MILLISECONDS_PER_DAY)
}
