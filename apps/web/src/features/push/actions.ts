'use server'
import { STAFF_ROLES } from '@hold/domain'
import { registerStaffPush, unregisterStaffPush } from '@hold/db'
import { STAFF_ACTIONS } from '@hold/mobile-api'
import { readLocale } from '@/features/auth/locale-input'
import { shopAction } from '@/server/shop-access'

// A member of staff's phone asks for push notifications in the shop it is working in (architecture.md section 13.9).
// shopAction binds it to the signed-in person and the shop they named, where they must hold a role; which events
// reach them is decided by their role when a push is sent (STAFF_PUSH_ROLES). Moves no money and needs no passkey.
export const registerPush = shopAction({ name: 'staff.push_registered', roles: STAFF_ROLES, needsPasskey: false, input: STAFF_ACTIONS['register-push'].input }, async (context, input, transaction) => {
  await registerStaffPush(transaction, { shopId: context.shop.id, userId: context.person.userId }, { token: input.pushToken, platform: input.platform, locale: readLocale(input.locale) }, new Date())
  return {}
})

export const unregisterPush = shopAction({ name: 'staff.push_unregistered', roles: STAFF_ROLES, needsPasskey: false, input: STAFF_ACTIONS['unregister-push'].input }, async (context, input, transaction) => {
  await unregisterStaffPush(transaction, context.person.userId, input.pushToken, new Date())
  return {}
})
