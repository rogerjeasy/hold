import type { StaffRole } from './approval.ts'
import type { Money } from './money.ts'

// Who may bring whom into a shop. A shop has one owner, so nobody is invited as one.
const INVITABLE: Readonly<Record<StaffRole, readonly StaffRole[]>> = {
  owner: ['manager', 'counter_staff', 'read_only'],
  manager: ['counter_staff', 'read_only'],
  counter_staff: [],
  read_only: [],
}

export function mayInvite(inviter: StaffRole, invitee: StaffRole): boolean {
  return INVITABLE[inviter].includes(invitee)
}

export function invitableRoles(inviter: StaffRole): readonly StaffRole[] {
  return INVITABLE[inviter]
}

// How long an invitation link works.
export const INVITATION_DAYS = 7

// Who must prove themselves with more than an emailed code before acting: owners and managers, and anyone allowed
// to approve claims above the shop's threshold (architecture.md section 12.1). Hold asks them for a passkey.
export function needsStrongSignIn(role: StaffRole, approvalLimit: Money, ownerApprovalThreshold: Money | undefined): boolean {
  if (role === 'owner' || role === 'manager') return true
  if (role === 'read_only') return false
  return ownerApprovalThreshold !== undefined && approvalLimit.cents > ownerApprovalThreshold.cents
}
