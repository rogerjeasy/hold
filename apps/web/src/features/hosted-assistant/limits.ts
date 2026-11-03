import type { RateLimit } from '@hold/db'
import { hostedQuestionsPerDay } from '@hold/domain'
import { HOSTED_LIMITS } from '@hold/mcp'

// Each message costs a model call and several tool calls, so a network gets twenty in a quarter of an hour. Every
// network together gets as many in a day as fit in the assistant's share of the account's daily Claude tokens, each
// budgeted at its ceiling (packages/domain demo-limits.ts), so judges cannot leave the other AI features without.
export const HOSTED_QUESTION_LIMITS = {
  perNetwork: { name: 'hosted-assistant', max: 20, windowSeconds: 15 * 60 },
  perDay: { name: 'hosted-assistant-day', max: hostedQuestionsPerDay(HOSTED_LIMITS.tokens), windowSeconds: 24 * 60 * 60 },
} as const satisfies Record<string, RateLimit>
