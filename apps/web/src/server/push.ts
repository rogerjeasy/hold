import 'server-only'
import { inShop, recordPushDelivery, renterPushTargets, staffPushTargets } from '@hold/db'
import type { Transaction } from '@hold/db'
import { STAFF_PUSH_ROLES, staffPushPath } from '@hold/domain'
import type { RenterPushEvent, StaffPushEvent, StaffPushTarget } from '@hold/domain'
import { deliverPushes, renterPush, staffPush } from '@hold/notify'
import { getServices } from './services'

// Push notifications from the web app (architecture.md section 13.9), beside the texts and emails it sends. A push is
// extra: a failure is logged by its kind, never with a token, and never fails the work that sent it.

const failed = (error: unknown) => {
  console.warn(JSON.stringify({ event: 'push_failed', error: error instanceof Error ? error.name : 'unknown' }))
}

// Inside the caller's transaction, in a savepoint of its own, so a push that fails cannot undo the caller's work.
export async function pushToRenterIn(transaction: Transaction, rentalId: string, event: RenterPushEvent): Promise<void> {
  try {
    const { push } = await getServices()
    await transaction.transaction(async (savepoint) => {
      const now = new Date()
      const targets = await renterPushTargets(savepoint, rentalId, now)
      if (targets === undefined) return
      const delivery = await deliverPushes(push, targets.devices, (device) => renterPush(event, { shopName: targets.shopName, language: device.locale, reference: device.reference }))
      await recordPushDelivery(savepoint, delivery, now)
    })
  } catch (error) {
    failed(error)
  }
}

// After a change has committed, such as a claim presented, which has no text or email of its own to go with.
export async function pushToRenter(shopId: string, rentalId: string, event: RenterPushEvent): Promise<void> {
  try {
    const { database } = await getServices()
    await inShop(database, { role: 'hold_app', shopId }, (transaction) => pushToRenterIn(transaction, rentalId, event))
  } catch (error) {
    failed(error)
  }
}

// The phones of everyone whose role hears this event in the shop, each opening the counter screen named.
export async function pushToStaff(shopId: string, event: StaffPushEvent, target: StaffPushTarget): Promise<void> {
  try {
    const { database, push } = await getServices()
    await inShop(database, { role: 'hold_app', shopId }, async (transaction) => {
      const now = new Date()
      const targets = await staffPushTargets(transaction, shopId, STAFF_PUSH_ROLES[event])
      if (targets === undefined) return
      const path = staffPushPath(target)
      const delivery = await deliverPushes(push, targets.devices, (device) => staffPush(event, { shopName: targets.shopName, language: device.locale, shopId, path }))
      await recordPushDelivery(transaction, delivery, now)
    })
  } catch (error) {
    failed(error)
  }
}
