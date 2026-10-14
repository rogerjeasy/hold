import { describe, expect, it } from 'vitest'
import { mayConfirm } from './approval.ts'
import type { ApprovalAction, Approver, StaffRole } from './approval.ts'
import { money } from './money.ts'

const chf = (cents: number) => money(cents, 'CHF')
const person = (role: StaffRole, staffId = `${role}-1`): Approver => ({ staffId, role, approvalLimit: chf(100_00) })
const allowed = { ok: true, value: undefined }

describe('approval rules', () => {
  it('lets any staff member release a hold after a clean return', () => {
    expect(mayConfirm(person('counter_staff'), { kind: 'release_after_clean_return' })).toEqual(allowed)
  })

  it('lets a staff member approve a claim up to their limit, and not above it', () => {
    expect(mayConfirm(person('counter_staff'), { kind: 'approve_claim', total: chf(100_00) })).toEqual(allowed)
    expect(mayConfirm(person('counter_staff'), { kind: 'approve_claim', total: chf(100_01) })).toEqual({
      ok: false,
      error: { kind: 'over_approval_limit', limit: chf(100_00) },
    })
  })

  it.each(['owner', 'manager'] as const)('lets the %s approve a claim above the staff limit', (role) => {
    expect(mayConfirm(person(role), { kind: 'approve_claim', total: chf(5000_00) })).toEqual(allowed)
  })

  it('lets the person who raised a claim reduce it, and no other counter staff', () => {
    const action: ApprovalAction = { kind: 'reduce_or_waive_claim', raisedBy: 'counter_staff-1' }
    expect(mayConfirm(person('counter_staff'), action)).toEqual(allowed)
    expect(mayConfirm(person('counter_staff', 'counter_staff-2'), action)).toMatchObject({ ok: false })
    expect(mayConfirm(person('manager'), action)).toEqual(allowed)
  })

  it('keeps the person who raised a contested claim from deciding it, unless they are the only one', () => {
    expect(mayConfirm(person('manager'), { kind: 'decide_contested_claim', raisedBy: 'manager-1', shopStaffCount: 3 })).toEqual({
      ok: false,
      error: { kind: 'raised_the_claim' },
    })
    expect(mayConfirm(person('owner'), { kind: 'decide_contested_claim', raisedBy: 'owner-1', shopStaffCount: 1 })).toEqual(allowed)
    expect(mayConfirm(person('counter_staff'), { kind: 'decide_contested_claim', raisedBy: 'manager-1', shopStaffCount: 3 })).toMatchObject({
      ok: false,
    })
  })

  it('leaves refunds to the owner or a manager', () => {
    expect(mayConfirm(person('manager'), { kind: 'refund_part_of_charge' })).toEqual(allowed)
    expect(mayConfirm(person('counter_staff'), { kind: 'refund_part_of_charge' })).toMatchObject({ ok: false })
  })

  it.each<ApprovalAction>([
    { kind: 'release_after_clean_return' },
    { kind: 'approve_claim', total: chf(1) },
    { kind: 'reduce_or_waive_claim', raisedBy: 'read_only-1' },
    { kind: 'decide_contested_claim', raisedBy: 'someone', shopStaffCount: 2 },
    { kind: 'refund_part_of_charge' },
  ])('refuses a read-only member everything: $kind', (action) => {
    expect(mayConfirm(person('read_only'), action)).toEqual({ ok: false, error: { kind: 'role_may_not_confirm', role: 'read_only' } })
  })
})
