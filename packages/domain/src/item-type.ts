import type { Money } from './money.ts'
import { checkPhotoPlan } from './photo-plan.ts'
import type { ItemCategory, PhotoPlanProblem, PhotoPlanViewDraft } from './photo-plan.ts'

// A kind of thing a shop rents: what it is worth, what is held while it is out, what a day of it costs, the kit
// that goes with it and the views photographed at each handover and return (architecture.md section 6.3).

// Something handed over with an item and counted back at the return, such as a charger or a lock.
export type Accessory = { readonly name: string; readonly count: number }

export const ITEM_TYPE_LIMITS = { name: 60, accessories: 10, accessoryName: 40, accessoryCount: 20 } as const

export type ItemTypeDraft = {
  readonly name: string
  readonly category: ItemCategory
  readonly currency: string
  // What it costs to replace. A hold is never above it.
  readonly value: Money
  readonly hold: Money
  readonly dayRate: Money
  readonly accessories: readonly Accessory[]
  readonly views: readonly PhotoPlanViewDraft[]
}

export type ItemTypeProblem =
  | { readonly kind: 'name_missing' }
  | { readonly kind: 'name_too_long' }
  | { readonly kind: 'value_zero' }
  | { readonly kind: 'hold_zero' }
  | { readonly kind: 'day_rate_zero' }
  | { readonly kind: 'hold_above_value' }
  | { readonly kind: 'wrong_currency'; readonly field: 'value' | 'hold' | 'dayRate' }
  | { readonly kind: 'too_many_accessories' }
  | { readonly kind: 'accessory_name_missing'; readonly accessory: number }
  | { readonly kind: 'accessory_name_too_long'; readonly accessory: number }
  | { readonly kind: 'accessory_repeated'; readonly accessory: number }
  | { readonly kind: 'accessory_count_invalid'; readonly accessory: number }
  | PhotoPlanProblem

export function checkItemType(draft: ItemTypeDraft): readonly ItemTypeProblem[] {
  const problems: ItemTypeProblem[] = []
  const name = draft.name.trim()
  if (name === '') problems.push({ kind: 'name_missing' })
  else if (name.length > ITEM_TYPE_LIMITS.name) problems.push({ kind: 'name_too_long' })
  if (draft.value.cents === 0) problems.push({ kind: 'value_zero' })
  if (draft.hold.cents === 0) problems.push({ kind: 'hold_zero' })
  if (draft.dayRate.cents === 0) problems.push({ kind: 'day_rate_zero' })
  for (const field of ['value', 'hold', 'dayRate'] as const) {
    if (draft[field].currency !== draft.currency) problems.push({ kind: 'wrong_currency', field })
  }
  if (draft.hold.cents > draft.value.cents) problems.push({ kind: 'hold_above_value' })
  problems.push(...checkAccessories(draft.accessories))
  problems.push(...checkPhotoPlan(draft.views))
  return problems
}

function checkAccessories(accessories: readonly Accessory[]): readonly ItemTypeProblem[] {
  if (accessories.length > ITEM_TYPE_LIMITS.accessories) return [{ kind: 'too_many_accessories' }]
  const problems: ItemTypeProblem[] = []
  const seen = new Set<string>()
  accessories.forEach((accessory, index) => {
    const name = accessory.name.trim()
    const key = name.toLowerCase()
    if (name === '') problems.push({ kind: 'accessory_name_missing', accessory: index })
    else if (name.length > ITEM_TYPE_LIMITS.accessoryName) problems.push({ kind: 'accessory_name_too_long', accessory: index })
    else if (seen.has(key)) problems.push({ kind: 'accessory_repeated', accessory: index })
    seen.add(key)
    if (!Number.isInteger(accessory.count) || accessory.count < 1 || accessory.count > ITEM_TYPE_LIMITS.accessoryCount) {
      problems.push({ kind: 'accessory_count_invalid', accessory: index })
    }
  })
  return problems
}
