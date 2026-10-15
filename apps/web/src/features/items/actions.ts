'use server'

import { checkItemType, ITEM_CATEGORIES, ITEM_STATUSES, parseAmount, VIEW_OUTLINES } from '@hold/domain'
import { addItems as addNewItems, changeStatus, editItem as editOneItem, saveItemType as saveType } from '@hold/db'
import { z } from 'zod'
import { list, Refusal, shopAction, withLocale } from '@/server/shop-access'

// Every server function that changes the shop's items. Each is built by shopAction, which checks who is asking,
// their role and their passkey before the work below runs, and writes the audit line after it. A test checks that
// this file exports nothing else.

const text = (max: number) => z.string().max(max).default('')

// A type's amounts are what a renter is held and charged, so changing them needs the same proof as the price list.
export const saveItemType = shopAction(
  {
    name: 'items.type_saved',
    roles: ['owner', 'manager'],
    needsPasskey: true,
    input: withLocale({
      itemTypeId: z.union([z.uuid(), z.literal('')]),
      name: z.string().max(200),
      category: z.enum(ITEM_CATEGORIES),
      value: text(20),
      hold: text(20),
      dayRate: text(20),
      accessoryName: list(z.string().max(200)),
      accessoryCount: list(z.string().max(4)),
      viewLabel: list(z.string().max(200)),
      viewOutline: list(z.enum(VIEW_OUTLINES)),
      viewRequired: list(z.enum(['yes', 'no'])),
    }),
  },
  async (context, input, transaction) => {
    const { currency } = context.shop
    if (currency === null) return new Refusal('currency_unset')
    if (input.accessoryCount.length !== input.accessoryName.length) return new Refusal('rows_mismatched')
    if (input.viewOutline.length !== input.viewLabel.length || input.viewRequired.length !== input.viewLabel.length) return new Refusal('rows_mismatched')
    const value = parseAmount(input.value, currency)
    if (value === undefined) return new Refusal('value_invalid')
    const hold = parseAmount(input.hold, currency)
    if (hold === undefined) return new Refusal('hold_invalid')
    const dayRate = parseAmount(input.dayRate, currency)
    if (dayRate === undefined) return new Refusal('day_rate_invalid')
    const draft = {
      name: input.name,
      category: input.category,
      currency,
      value,
      hold,
      dayRate,
      accessories: input.accessoryName.map((name, index) => ({ name, count: Number(input.accessoryCount[index]) })),
      views: input.viewLabel.map((label, index) => ({ label, outline: input.viewOutline[index] ?? 'whole_side', required: input.viewRequired[index] === 'yes' })),
    }
    const [problem] = checkItemType(draft)
    if (problem !== undefined) {
      const at = 'view' in problem ? problem.view : 'accessory' in problem ? problem.accessory : undefined
      return new Refusal(at === undefined ? problem.kind : `${problem.kind}:${String(at)}`)
    }
    const saved = await saveType(transaction, context.shop.id, { ...(input.itemTypeId === '' ? {} : { id: input.itemTypeId }), draft }, new Date())
    return saved.ok ? { id: saved.id } : new Refusal(saved.reason)
  },
)

// Adding items changes no amount a renter agrees to, so an emailed code is enough.
export const addItems = shopAction(
  {
    name: 'items.added',
    roles: ['owner', 'manager'],
    needsPasskey: false,
    input: withLocale({ itemTypeId: z.uuid(), count: z.coerce.number().int(), size: text(100), serial: text(100) }),
  },
  async (_context, input, transaction) => {
    const added = await addNewItems(transaction, input, new Date())
    return added.ok ? { labels: added.labels } : new Refusal(added.reason)
  },
)

export const editItem = shopAction(
  {
    name: 'items.edited',
    roles: ['owner', 'manager'],
    needsPasskey: false,
    input: withLocale({ itemId: z.uuid(), label: z.string().max(200), size: text(100), serial: text(100) }),
  },
  async (_context, input, transaction) => {
    const edited = await editOneItem(transaction, input.itemId, input)
    return edited.ok ? {} : new Refusal(edited.reason)
  },
)

// Counter staff see a flat tyre first, so they may send an item to repair. Retiring ends its record, so only the
// owner and managers may.
export const changeItemStatus = shopAction(
  {
    name: 'items.status_changed',
    roles: ['owner', 'manager', 'counter_staff'],
    needsPasskey: false,
    input: withLocale({ itemId: z.uuid(), status: z.enum(ITEM_STATUSES), note: text(500) }),
  },
  async (context, input, transaction) => {
    if (input.status === 'retired' && context.role === 'counter_staff') return new Refusal('role_may_not_retire')
    const changed = await changeStatus(transaction, input.itemId, { to: input.status, note: input.note }, new Date())
    return changed.ok ? {} : new Refusal(changed.reason)
  },
)
