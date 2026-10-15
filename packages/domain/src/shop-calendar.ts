// A shop's day and month run by its own clock, wherever the server is. The clock is passed in.

export type PartOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

export type ShopDay = {
  readonly start: Date
  readonly end: Date
  readonly monthStart: Date
  readonly part: PartOfDay
}

type WallClock = { readonly year: number; readonly month: number; readonly day: number; readonly hour: number }

function wallClock(timeZone: string, instant: Date): WallClock & { readonly minute: number; readonly second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((each) => each.type === type)?.value ?? 0)
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute'), second: part('second') }
}

// How far the zone's wall clock is ahead of UTC at this instant, in milliseconds.
function offsetAt(timeZone: string, instant: Date): number {
  const clock = wallClock(timeZone, instant)
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second)
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

// The instant the zone's clock shows midnight on this date. Checked twice, so a change of offset that day is caught.
function midnight(timeZone: string, year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day)
  const first = guess - offsetAt(timeZone, new Date(guess))
  return new Date(guess - offsetAt(timeZone, new Date(first)))
}

function partOf(hour: number): PartOfDay {
  if (hour < 5) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

export function shopDay(timeZone: string, now: Date): ShopDay {
  const today = wallClock(timeZone, now)
  // Date.UTC rolls the 32nd of a month over into the next, which is what tomorrow needs.
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1))
  return {
    start: midnight(timeZone, today.year, today.month, today.day),
    end: midnight(timeZone, tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate()),
    monthStart: midnight(timeZone, today.year, today.month, 1),
    part: partOf(today.hour),
  }
}

// A date and time as a form sends it, read on the shop's clock: "2026-10-16T10:00" in Lisbon is 09:00 UTC in summer.
// Nothing for text that is not a real date and time.
export function atShopTime(timeZone: string, local: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (match === null) return undefined
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number]
  const asUtc = Date.UTC(year, month - 1, day, hour, minute)
  const check = new Date(asUtc)
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) return undefined
  // Checked twice, so an instant next to a change of offset is placed by the offset in force at it.
  const first = asUtc - offsetAt(timeZone, new Date(asUtc))
  return new Date(asUtc - offsetAt(timeZone, new Date(first)))
}

// The shop's clock at an instant, in the form a date and time field takes.
export function shopTimeText(timeZone: string, instant: Date): string {
  const clock = wallClock(timeZone, instant)
  const two = (value: number) => String(value).padStart(2, '0')
  return `${String(clock.year)}-${two(clock.month)}-${two(clock.day)}T${two(clock.hour)}:${two(clock.minute)}`
}
