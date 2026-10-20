import { mayConfirm, money, RENTAL_TRANSITIONS, transition } from '@hold/domain'
import type { ApprovalAction } from '@hold/domain'
import { eq } from 'drizzle-orm'
import { rentals, staffRoles } from './schema/index.ts'
import type { Transaction } from './scope.ts'

export async function claimStaff(transaction: Transaction, userId: string, currency: string, action?: ApprovalAction) {
  const [staff] = await transaction.select().from(staffRoles).where(eq(staffRoles.userId, userId))
  if (staff === undefined || staff.role === 'read_only') return { ok: false, reason: 'role_may_not_confirm' } as const
  if (action !== undefined) {
    const allowed = mayConfirm({ staffId: userId, role: staff.role, approvalLimit: money(staff.approvalLimitCents, currency) }, action)
    if (!allowed.ok) return { ok: false, reason: allowed.error.kind } as const
  }
  return { ok: true } as const
}

export async function startSettling(transaction: Transaction, rentalId: string) {
  const [rental] = await transaction.select().from(rentals).where(eq(rentals.id, rentalId)).for('update')
  if (rental === undefined) throw new Error('The settling rental is missing.')
  let state = rental.state
  for (const target of ['inspecting', 'settling'] as const) {
    if (transition(RENTAL_TRANSITIONS, state, target).ok) {
      await transaction.update(rentals).set({ state: target }).where(eq(rentals.id, rentalId))
      state = target
    }
  }
}
