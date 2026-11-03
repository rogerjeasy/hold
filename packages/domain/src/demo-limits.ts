// What the public demo may spend in a day across every network, and how long one judge's demo lasts (architecture.md
// section 20.3). The per-network limits stop one caller; these stop all of them together.

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000

// Each start makes two Cognito users and a shop with its sample rentals. Two hundred users a day stay under the user
// pool's 10,000 free monthly active users even over a 31-day month.
export const DEMO_STARTS_PER_DAY = 100

// Claude Opus 4.6 on Bedrock has a daily token limit in this account that Service Quotas does not list. On 29 October
// 2026 it ran out after about 940,000 tokens, counted by that day's evaluation runs; once spent, every AI feature
// defers for the rest of the day. Taken a little under what was measured.
export const CLAUDE_DAILY_TOKENS = 900_000

// The hosted assistant may use at most half of it. The other half is for the photograph comparisons, the advocates,
// the operations agent and the insights agent, and covers a question that passes its ceiling by its last call.
export const HOSTED_ASSISTANT_SHARE = 0.5

// How many hosted-assistant questions a day may ask, each budgeted at its token ceiling. Never fewer than one.
export function hostedQuestionsPerDay(tokensPerQuestion: number): number {
  return Math.max(1, Math.floor((CLAUDE_DAILY_TOKENS * HOSTED_ASSISTANT_SHARE) / tokensPerQuestion))
}

// The day a daily cap counts in: the calendar day in UTC, so every server counts the same day.
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

// A judge can come back to their demo for a week. Judging runs from 1 to 15 December 2026, so a demo started on the
// first day is still there a week on, and the user pool never holds more than seven days of demo accounts.
export const DEMO_SESSION_DAYS = 7

// A demo opened before this moment is retired: its two accounts are removed and its shop is marked retired.
export function demoRetirementCutoff(now: Date): Date {
  return new Date(now.getTime() - DEMO_SESSION_DAYS * DAY_MILLISECONDS)
}
