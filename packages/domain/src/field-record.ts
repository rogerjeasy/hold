export type FieldRecordMonthCounts = { readonly month: string; readonly removed: number; readonly total: number }

// Fewer findings than this in a month say nothing either way.
const SMALLEST_MONTH = 5
// How far above the earlier months' share of removed findings this month may rise before the owner is told.
const RISE = 0.2
// With no earlier months, the share that is already too high.
const FIRST_MONTH_LIMIT = 0.5

// Whether the latest month's share of findings a person removed rose sharply (extensions.md section 5.7).
export function fieldRecordAlarm(months: readonly FieldRecordMonthCounts[]): boolean {
  const latest = months.at(-1)
  if (latest === undefined || latest.total < SMALLEST_MONTH) return false
  const share = latest.removed / latest.total
  const earlier = months.slice(0, -1)
  const earlierTotal = earlier.reduce((sum, each) => sum + each.total, 0)
  if (earlierTotal === 0) return share >= FIRST_MONTH_LIMIT
  return share - earlier.reduce((sum, each) => sum + each.removed, 0) / earlierTotal > RISE
}
