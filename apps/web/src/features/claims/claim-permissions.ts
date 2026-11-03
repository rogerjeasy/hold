import type { ClaimWorkspace } from '@hold/db'
import { mayConfirm, money } from '@hold/domain'
import type { ApprovalAction, ApprovalRefused, StaffRole } from '@hold/domain'

// The person reading a claim, with what the server weighs before it lets them decide one (architecture.md section 7.3).
export type ClaimViewer = { readonly userId: string; readonly role: StaffRole; readonly approvalLimitCents: number; readonly staffCount: number }

type Claim = NonNullable<ClaimWorkspace['claim']>

// What the claim page may offer this person, by the same rule the server applies (packages/domain approval.ts): a
// refusal in place of each decision they may not take, so the page can say why instead of offering a button the
// server would refuse. Showing it is courtesy; the server still checks every one.
export function claimRefusals(viewer: ClaimViewer, claim: Claim, currency: string, contested: boolean, promiseMissed: boolean): { readonly approve: ApprovalRefused | null; readonly decide: ApprovalRefused | null } {
  const check = (action: ApprovalAction) => {
    const allowed = mayConfirm({ staffId: viewer.userId, role: viewer.role, approvalLimit: money(viewer.approvalLimitCents, currency) }, action)
    return allowed.ok ? null : allowed.error
  }
  const raisedBy = claim.raisedByUserId ?? ''
  return {
    approve: check({ kind: 'approve_claim', total: money(claim.totalCents, currency) }),
    decide: check(contested ? { kind: 'decide_contested_claim', raisedBy, shopStaffCount: viewer.staffCount, promiseMissed } : { kind: 'reduce_or_waive_claim', raisedBy }),
  }
}
