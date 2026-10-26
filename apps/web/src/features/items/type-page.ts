import 'server-only'
import { amountText, money } from '@hold/domain'
import type { CatalogType } from '@hold/db'
import type { ItemTypeFormValues } from './item-type-form'

// A saved type as the item type form's values.
export function formValues(type: CatalogType): ItemTypeFormValues {
  const text = (cents: number) => amountText(money(cents, type.currency))
  return {
    itemTypeId: type.id,
    name: type.name,
    category: type.category,
    value: text(type.valueCents),
    hold: text(type.holdCents),
    dayRate: text(type.dayRateCents),
    accessories: type.accessories.map((accessory) => ({ name: accessory.name, count: String(accessory.count) })),
    views: type.views.map((view) => ({ label: view.label, outline: view.outline, required: view.required })),
  }
}
