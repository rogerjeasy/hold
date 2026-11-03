// What the public demo may spend in a day across every network, and how long one judge's demo lasts (architecture.md
// section 20.3). The per-network limits stop one caller; these stop all of them together.

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000

// Each start makes two Cognito users and a shop with its sample rentals. Two hundred users a day stay under the user
// pool's 10,000 free monthly active users even over a 31-day month.
export const DEMO_STARTS_PER_DAY = 100

// Bedrock limits each model's tokens a day on its own (claude-models.ts). The comparison's model, Opus 4.6, has a daily
// limit in this account that Service Quotas does not list: on 29 October 2026 it ran out after about 940,000 tokens,
// counted by that day's evaluation runs. The agents' model, Opus 4.5, has one listed at 6,750,000 (3 November 2026).
// Once a model's day is spent, what runs on it defers for the rest of the day. Each is taken a little under.
export const COMPARISON_DAILY_TOKENS = 900_000
export const AGENT_DAILY_TOKENS = 6_000_000

// The hosted assistant may use at most half of the agents' day. The other half is for the advocates, the operations
// agent, the insights agent, the contest summaries and the incident sorting, and covers a question that passes its
// ceiling by its last call.
export const HOSTED_ASSISTANT_SHARE = 0.5

// How many hosted-assistant questions a day may ask, each budgeted at its token ceiling. Never fewer than one.
export function hostedQuestionsPerDay(tokensPerQuestion: number): number {
  return Math.max(1, Math.floor((AGENT_DAILY_TOKENS * HOSTED_ASSISTANT_SHARE) / tokensPerQuestion))
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

// One network's share of the hosted assistant's day: enough for two or three bookings, each three or four questions,
// and a small part of the day's questions, so one visitor never leaves every judge without.
export const HOSTED_QUESTIONS_PER_NETWORK = 10

// Each sample handed to the two advocates is a run of several model calls. The first live run on Bedrock, on 3 November
// 2026, spent about 28,000 tokens in 8 calls, so a sample's run is bounded at 80,000, well under a real claim's ceiling.
// A day of the agents' sample runs at their ceilings (the advocates' and the investigations') stays inside what the
// hosted assistant leaves of the agents' day, enough for every judge of a day. Once they are spent the claim page shows
// a recorded live run.
export const SAMPLE_ADVOCATE_RUN_TOKENS = 80_000
export const SAMPLE_ADVOCATE_RUNS_PER_DAY = 15

// AG Studio's insights agent takes several short turns for each question. Every demo is a shop of its own, so a cap per
// shop bounds nothing in total: this one spans every shop.
export const INSIGHTS_TURNS_PER_DAY = 60

// One network's and one shop's share of those days: a visitor can start several demos, each a shop of its own, so a
// share per network keeps one of them from taking a day's cap alone. Each demo has its own sample run, so a judge on a
// network someone else used that day still has theirs.
export const SAMPLE_ADVOCATE_RUNS_PER_SHOP = 2
export const SAMPLE_ADVOCATE_RUNS_PER_NETWORK = 4
export const INSIGHTS_TURNS_PER_NETWORK = 20
export const INSIGHTS_TURNS_PER_SHOP = 15

// A judge has Claude compare the demonstration's photographs on the sample return that waits for its comparison. One
// view takes a first look at both full photographs and a second look at crops: budgeted at 30,000 tokens, about half
// again what one look with two photographs spent on 2 November 2026. Each demo shop has one such return, so a share per
// shop is the return itself; these stop many demos together, at two thirds of the comparison model's day, so real
// returns keep the rest.
export const SAMPLE_COMPARISON_TOKENS = 30_000
export const SAMPLE_COMPARISON_RUNS_PER_DAY = 20
export const SAMPLE_COMPARISON_RUNS_PER_NETWORK = 3

// A demo's two sample entries on the morning queue, investigated by the operations agent when the owner asks
// (extensions.md section 6.14). A run is at most two investigations of a few short turns each, so it stops at 40,000
// tokens rather than a nightly run's 400,000: once per demo a day, twice per network, ten times in all.
export const SAMPLE_INVESTIGATION_TOKENS = 40_000
export const SAMPLE_INVESTIGATIONS_PER_SHOP = 1
export const SAMPLE_INVESTIGATIONS_PER_NETWORK = 2
export const SAMPLE_INVESTIGATIONS_PER_DAY = 10
