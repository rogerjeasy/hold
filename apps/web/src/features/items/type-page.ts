import 'server-only'
import { amountText, money } from '@hold/domain'
import type { CatalogType } from '@hold/db'
import { readAccessToken } from '@/features/auth/session-cookies'
import { getServices } from '@/server/services'
import type { ShopContext } from '@/server/shop-access'
import type { ItemTypeFormValues } from './item-type-form'

// What both item type pages need: the passkey gate's state, and a saved type as the form's values.
export async function passkeyGate(context: ShopContext) {
  const { identity } = await getServices()
  const passkeys = await identity.listPasskeys((await readAccessToken()) ?? '')
  return { needed: context.passkeyNeeded, hasPasskey: passkeys.ok && passkeys.value.length > 0, email: context.person.email }
}

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
