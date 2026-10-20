import type { ClaimState } from './claim.ts'
import { chargeTime } from './upkeep.ts'
// An already contested claim waits for a person. The expiry exception preserves the renter's original reply period.
export function claimDeadlineAction(state: ClaimState, replyDueAt: Date, validUntil: Date, now: Date): 'wait' | 'lapse' | 'protect' {
  if (state !== 'presented') return 'wait'
  if (now >= replyDueAt) return 'lapse'
  return now >= chargeTime(replyDueAt, validUntil).at ? 'protect' : 'wait'
}

export function claimReplyAllowed(state: ClaimState, replyDueAt: Date | null, now: Date, protectedCapture: boolean, alreadyReplied: boolean): boolean {
  return !alreadyReplied && replyDueAt !== null && now < replyDueAt && (state === 'presented' || (protectedCapture && ['charging', 'charged', 'charge_failed'].includes(state)))
}
