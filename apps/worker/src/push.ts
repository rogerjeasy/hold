import { inShop, recordPushDelivery, renterPushTargets, staffPushTargets } from '@hold/db'
import type { Database } from '@hold/db'
import { STAFF_PUSH_ROLES, staffPushPath } from '@hold/domain'
import type { RenterPushEvent, StaffPushEvent, StaffPushTarget } from '@hold/domain'
import { deliverPushes, expoAccessTokenFromSecret, createExpoPushSender, renterPush, staffPush } from '@hold/notify'
import type { PushSender } from '@hold/notify'

// Push notifications from the worker (architecture.md section 13.9), beside the texts and emails it sends, each in a
// transaction of its own as hold_worker. A push is extra: a failure is logged by its kind, never with a token, and
// never fails the job, so the queue does not send the text or email again because of it.

export type RenterPush = (shopId: string, rentalId: string, event: RenterPushEvent) => Promise<void>
export type StaffPush = (shopId: string, event: StaffPushEvent, target: StaffPushTarget) => Promise<void>

const failed = (error: unknown) => {
  console.warn(JSON.stringify({ event: 'push_failed', error: error instanceof Error ? error.name : 'unknown' }))
}

export function createRenterPush(options: { readonly database: Database; readonly push: PushSender }): RenterPush {
  return async (shopId, rentalId, event) => {
    try {
      await inShop(options.database, { role: 'hold_worker', shopId }, async (transaction) => {
        const now = new Date()
        const targets = await renterPushTargets(transaction, rentalId, now)
        if (targets === undefined) return
        const delivery = await deliverPushes(options.push, targets.devices, (device) => renterPush(event, { shopName: targets.shopName, language: device.locale, reference: device.reference }))
        await recordPushDelivery(transaction, delivery, now)
      })
    } catch (error) {
      failed(error)
    }
  }
}

export function createStaffPush(options: { readonly database: Database; readonly push: PushSender }): StaffPush {
  return async (shopId, event, target) => {
    try {
      await inShop(options.database, { role: 'hold_worker', shopId }, async (transaction) => {
        const now = new Date()
        const targets = await staffPushTargets(transaction, shopId, STAFF_PUSH_ROLES[event])
        if (targets === undefined) return
        const path = staffPushPath(target)
        const delivery = await deliverPushes(options.push, targets.devices, (device) => staffPush(event, { shopName: targets.shopName, language: device.locale, shopId, path }))
        await recordPushDelivery(transaction, delivery, now)
      })
    } catch (error) {
      failed(error)
    }
  }
}

// The worker's pushes through Expo, with the access token from the secret infra names. Unset, pushes go without one.
export function workerPushSender(environment: Readonly<Record<string, string | undefined>>): PushSender {
  return createExpoPushSender({ accessToken: expoAccessTokenFromSecret(environment['HOLD_PUSH_SECRET'], environment['AWS_REGION'] ?? 'us-east-1') })
}
