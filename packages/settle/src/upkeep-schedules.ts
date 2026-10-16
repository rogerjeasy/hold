import type { HoldUpkeep } from '@hold/db'
import type { SettleDependencies } from './dependencies.ts'
import type { UpkeepMessage } from './queue-messages.ts'

// The schedules that watch a placed hold (architecture.md section 7.4): one starts a replacement three days before the
// hold's end, one marks it expired at its end. Named by the authorization they watch, so making them again changes
// nothing, and a replacement's authorization gets schedules of its own.

export const UPKEEP_QUEUE = 'upkeep'

export type UpkeepKind = UpkeepMessage['kind']

export function upkeepScheduleName(kind: UpkeepKind, authorizationId: string): string {
  return `hold-${kind}-${authorizationId}`
}

export async function scheduleUpkeep(dependencies: SettleDependencies, shopId: string, upkeep: HoldUpkeep): Promise<void> {
  await scheduleStep(dependencies, shopId, upkeep, 'replace', upkeep.startReplacementAt)
  await scheduleStep(dependencies, shopId, upkeep, 'expire', upkeep.expiresAt)
}

// One step of a hold's upkeep, at its time. A step already due goes to its queue now, since a schedule in the past
// never fires.
export async function scheduleStep(dependencies: SettleDependencies, shopId: string, upkeep: Pick<HoldUpkeep, 'holdId' | 'authorizationId'>, kind: UpkeepKind, at: Date): Promise<void> {
  const name = upkeepScheduleName(kind, upkeep.authorizationId)
  const message = { queue: UPKEEP_QUEUE, group: upkeep.holdId, deduplicationId: name, body: { shopId, holdId: upkeep.holdId, authorizationId: upkeep.authorizationId, kind } }
  if (at <= dependencies.now()) await dependencies.send(message)
  else await dependencies.scheduler.at(name, at, message)
}
