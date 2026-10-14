import { addDays } from './hold-clocks.ts'

// How Hold keeps a hold useful (architecture.md section 7.4). PayPal allows one renewal per hold, so Hold spends it
// only at the moment it charges: a renewal made earlier is a guess about when a charge will come, and a late return
// or a long reply period would then leave the charge outside the renewal's assured period.

// The clocks of the authorization a hold currently rests on, as PayPal reported them.
export type AuthorizationClocks = {
  readonly assuredUntil: Date
  readonly validUntil: Date
  // True when this authorization came from a renewal. PayPal will not renew it again.
  readonly isRenewal: boolean
}

export type ChargePlan =
  // Capture on the current authorization. Unassured when the assured period has passed and no renewal is left.
  | { readonly kind: 'capture'; readonly assured: boolean }
  // Renew, then capture at once on the new authorization, inside its fresh assured period.
  | { readonly kind: 'renew_then_capture' }
  // The hold is gone. The claim goes by invoice.
  | { readonly kind: 'expired' }

export function planCharge(clocks: AuthorizationClocks, now: Date): ChargePlan {
  if (now >= clocks.validUntil) return { kind: 'expired' }
  if (now < clocks.assuredUntil) return { kind: 'capture', assured: true }
  if (!clocks.isRenewal) return { kind: 'renew_then_capture' }
  return { kind: 'capture', assured: false }
}

// When a renewal fails, Hold still tries to capture on the authorization it has. If that is refused too, the claim
// goes by invoice and the hold is released (architecture.md section 8.4).
export function planAfterFailedRenewal(clocks: AuthorizationClocks, now: Date): ChargePlan {
  return now >= clocks.validUntil ? { kind: 'expired' } : { kind: 'capture', assured: false }
}

// A charge the reply period would push past the hold's end is taken this long before it instead (section 7.5),
// leaving time for a renewal, a retry and the invoice fallback.
export const CHARGE_BEFORE_LAPSE_DAYS = 1
// A rental still open this long before the hold's end starts a replacement hold.
export const REPLACEMENT_LEAD_DAYS = 3

export function latestChargeTime(validUntil: Date): Date {
  return addDays(validUntil, -CHARGE_BEFORE_LAPSE_DAYS)
}

// When an approved claim is charged if the renter does not reply: at the end of the reply period, or before the
// hold lapses if that comes first. The renter is then told the claim is still open.
export function chargeTime(replyDueAt: Date, validUntil: Date): { readonly at: Date; readonly beforeReplyDue: boolean } {
  const latest = latestChargeTime(validUntil)
  return replyDueAt <= latest ? { at: replyDueAt, beforeReplyDue: false } : { at: latest, beforeReplyDue: true }
}

// The schedules a placed hold needs. None of them renews: renewal happens only inside a charge.
export type UpkeepSchedule = {
  readonly startReplacementAt: Date
  readonly expiresAt: Date
}

export function planUpkeep(clocks: Pick<AuthorizationClocks, 'validUntil'>): UpkeepSchedule {
  return { startReplacementAt: addDays(clocks.validUntil, -REPLACEMENT_LEAD_DAYS), expiresAt: clocks.validUntil }
}
