import { atMost } from './money.ts'
import type { Money } from './money.ts'
import { fail, ok } from './result.ts'
import type { Result } from './result.ts'

export const STAFF_ROLES = ['owner', 'manager', 'counter_staff', 'read_only'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

// One person's standing in one shop, from staff_roles.
export type Approver = {
  readonly staffId: string
  readonly role: StaffRole
  readonly approvalLimit: Money
}

export type ApprovalAction =
  | { readonly kind: 'release_after_clean_return' }
  | { readonly kind: 'approve_claim'; readonly total: Money }
  | { readonly kind: 'reduce_or_waive_claim'; readonly raisedBy: string }
  | { readonly kind: 'decide_contested_claim'; readonly raisedBy: string; readonly shopStaffCount: number }
  | { readonly kind: 'refund_part_of_charge' }

export type ApprovalRefused =
  | { readonly kind: 'role_may_not_confirm'; readonly role: StaffRole }
  | { readonly kind: 'over_approval_limit'; readonly limit: Money }
  | { readonly kind: 'raised_the_claim' }

// architecture.md section 7.3.
export function mayConfirm(approver: Approver, action: ApprovalAction): Result<void, ApprovalRefused> {
  const { role } = approver
  if (role === 'read_only') return fail({ kind: 'role_may_not_confirm', role })
  const senior = role === 'owner' || role === 'manager'

  switch (action.kind) {
    case 'release_after_clean_return':
      return ok(undefined)
    case 'approve_claim':
      if (senior || atMost(action.total, approver.approvalLimit)) return ok(undefined)
      return fail({ kind: 'over_approval_limit', limit: approver.approvalLimit })
    case 'reduce_or_waive_claim':
      return senior || action.raisedBy === approver.staffId ? ok(undefined) : fail({ kind: 'role_may_not_confirm', role })
    case 'decide_contested_claim':
      if (!senior) return fail({ kind: 'role_may_not_confirm', role })
      // A shop of one has nobody else to decide.
      if (action.raisedBy === approver.staffId && action.shopStaffCount > 1) return fail({ kind: 'raised_the_claim' })
      return ok(undefined)
    case 'refund_part_of_charge':
      return senior ? ok(undefined) : fail({ kind: 'role_may_not_confirm', role })
  }
}
