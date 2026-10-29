import type { RentalState } from './rental.ts'
import { fail, ok } from './result.ts'
import type { Result } from './result.ts'
import { atShopTime, shopDay, shopTimeText } from './shop-calendar.ts'
import type { ViewOutline } from './photo-plan.ts'

// A return with nobody at the counter (architecture.md section 6.13). The renter photographs the item through their
// link and leaves it at the shop's drop point. Nothing is charged and the hold stays until a person has seen the item;
// a photograph the renter took never leads to a charge on its own.

// The photograph of the item where the renter left it. It is evidence of where, never compared with the handover.
export const DROP_POINT_VIEW = 'drop-point'

export const SELF_RETURN_LIMITS = { dropPointLength: 300 } as const

const SELF_RETURN_STATES: ReadonlySet<RentalState> = new Set(['out', 'overdue'])

export function maySelfReturn(rental: { readonly allowed: boolean; readonly rentalState: RentalState; readonly handedOver: boolean }): boolean {
  return rental.allowed && rental.handedOver && SELF_RETURN_STATES.has(rental.rentalState)
}

type PlanView = { readonly key: string; readonly label: string; readonly outline: ViewOutline; readonly required: boolean }

export type SelfReturnStage = 'unavailable' | 'intro' | 'capture' | 'sent'

// What the renter's return page shows. Once sent, the receipt stays, whatever the shop decides after.
export function selfReturnStage(rental: { readonly allowed: boolean; readonly rentalState: RentalState; readonly handedOver: boolean; readonly started: boolean; readonly droppedOffAt: Date | null }): SelfReturnStage {
  if (rental.droppedOffAt !== null) return 'sent'
  if (!maySelfReturn(rental)) return 'unavailable'
  return rental.started ? 'capture' : 'intro'
}

// Every view photographed at the handover, each required, since there is nobody to look at the item: a view the
// renter skipped would stay unseen until morning, and a view with no handover photograph has nothing to compare with.
// Then where the item was left.
export function selfReturnViews(plan: readonly PlanView[], photographedAtHandover: readonly string[]): readonly PlanView[] {
  const compared = plan.filter((view) => photographedAtHandover.includes(view.key)).map((view) => ({ ...view, required: true }))
  return [...compared, { key: DROP_POINT_VIEW, label: DROP_POINT_VIEW, outline: 'whole_side', required: true }]
}

// The return counts from the moment the renter sent it, not from when the shop opened.
export function returnedOnTime(droppedOffAt: Date, endsAt: Date): boolean {
  return droppedOffAt.getTime() <= endsAt.getTime()
}

// When the shop's counter is staffed, the same every day, on the shop's clock: "09:00" to "19:00".
export type ShopHours = { readonly opens: string; readonly closes: string }

export type ShopOpening = { readonly open: true } | { readonly open: false; readonly opensAt: Date }

// Whether someone is at the counter now, or when someone next will be. Unknown when the shop has not said its hours.
export function shopOpening(hours: ShopHours | null, timeZone: string, now: Date): ShopOpening | undefined {
  if (hours === null) return undefined
  const at = (instant: Date, time: string) => atShopTime(timeZone, `${shopTimeText(timeZone, instant).slice(0, 10)}T${time}`)
  const opensToday = at(now, hours.opens)
  const closesToday = at(now, hours.closes)
  if (opensToday === undefined || closesToday === undefined) return undefined
  if (now < opensToday) return { open: false, opensAt: opensToday }
  if (now < closesToday) return { open: true }
  const opensTomorrow = at(shopDay(timeZone, now).end, hours.opens)
  return opensTomorrow === undefined ? undefined : { open: false, opensAt: opensTomorrow }
}

export type SelfReturnSettings = { readonly allowed: boolean; readonly dropPoint: string | null; readonly hours: ShopHours | null }

export type SelfReturnSettingsProblem = 'drop_point_needed' | 'drop_point_too_long' | 'hours_invalid'

const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/

// A renter is told where to leave the item in the shop's own words, so self-return cannot be on without them.
export function checkSelfReturnSettings(settings: { readonly allowed: boolean; readonly dropPoint: string; readonly hours: ShopHours | null }): Result<SelfReturnSettings, SelfReturnSettingsProblem> {
  const dropPoint = settings.dropPoint.trim()
  if (dropPoint.length > SELF_RETURN_LIMITS.dropPointLength) return fail('drop_point_too_long')
  if (settings.allowed && dropPoint === '') return fail('drop_point_needed')
  const { hours } = settings
  if (hours !== null && (!CLOCK_TIME.test(hours.opens) || !CLOCK_TIME.test(hours.closes) || hours.opens >= hours.closes)) return fail('hours_invalid')
  return ok({ allowed: settings.allowed, dropPoint: dropPoint === '' ? null : dropPoint, hours })
}
