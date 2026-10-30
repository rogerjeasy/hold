'use server'

import { closeRepair, openRepairFromMarks, startRepairCapture } from '@hold/db'
import { parseAmount, REPAIR_LIMITS, REPAIR_OUTCOMES } from '@hold/domain'
import { z } from 'zod'
import { list, Refusal, shopAction, withLocale } from '@/server/shop-access'
import { CAPTURE_STAFF, staffPhotoActions } from '@/server/staff-photo'

// Repair closes the loop (architecture.md section 9.6). Staff who photograph handovers and returns open a repair from an
// item's open marks, photograph it and close it. No money moves: the cost is the shop's own record.

export const openRepair = shopAction(
  { name: 'repair.opened', roles: CAPTURE_STAFF, needsPasskey: false, input: withLocale({ itemId: z.uuid(), markId: list(z.uuid()) }) },
  async (context, input, transaction) => {
    const opened = await openRepairFromMarks(transaction, { itemId: input.itemId, markIds: input.markId, userId: context.person.userId }, new Date())
    return opened.ok ? { repairId: opened.repairId, itemId: input.itemId } : new Refusal(opened.reason)
  },
)

// The session the repair's photographs go in. None when nothing on the repair has a mark to photograph.
export const startRepair = shopAction(
  { name: 'repair.capture_started', roles: CAPTURE_STAFF, needsPasskey: false, input: withLocale({ repairId: z.uuid() }) },
  async (context, input, transaction) => {
    const started = await startRepairCapture(transaction, input.repairId, context.person.userId, new Date())
    if (!started.ok) return new Refusal(started.reason)
    const repair = await transaction.query.repairs.findFirst({ columns: { itemId: true }, where: (each, { eq }) => eq(each.id, input.repairId) })
    return { sessionId: started.sessionId, itemId: repair?.itemId ?? '' }
  },
)

const photos = staffPhotoActions('repair')
export const requestPhotoUpload = photos.request
export const confirmPhotoUpload = photos.confirm

// Seals the photographs, records what was done to each line and what it cost, and closes the repaired marks.
export const finishRepair = shopAction(
  {
    name: 'repair.closed',
    roles: CAPTURE_STAFF,
    needsPasskey: false,
    input: withLocale({ repairId: z.uuid(), lineId: list(z.uuid()), outcome: list(z.enum(REPAIR_OUTCOMES)), cost: z.string().max(20), note: z.string().max(REPAIR_LIMITS.noteLength).default('') }),
  },
  async (context, input, transaction) => {
    const { currency } = context.shop
    if (currency === null) return new Refusal('currency_unset')
    if (input.lineId.length !== input.outcome.length) return new Refusal('outcome_missing')
    const cost = parseAmount(input.cost, currency)
    if (cost === undefined) return new Refusal('cost_invalid')
    const outcomes = Object.fromEntries(input.lineId.map((id, index) => [id, input.outcome[index] ?? 'left']))
    const closed = await closeRepair(transaction, { repairId: input.repairId, userId: context.person.userId, outcomes, costCents: cost.cents, note: input.note }, new Date())
    return closed.ok ? { repairId: closed.repairId, itemId: closed.itemId } : new Refusal(closed.reason)
  },
)
