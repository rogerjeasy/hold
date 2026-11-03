'use server'

import { createBedrockInsightsModel, createScriptedInsightsModel, INSIGHTS_TURN_CHARACTERS, runInsightsTurn, studioTurnSchema } from '@hold/agent'
import { insightsTokensSince, saveInsightsDashboard as saveDashboard } from '@hold/db'
import { INSIGHTS_BUDGET_HOURS, withinInsightsBudget } from '@hold/domain'
import { z } from 'zod'
import { getServices } from '@/server/services'
import { Refusal, shopAction } from '@/server/shop-access'
import { INSIGHTS_LIMITS } from './limits'

// The insights dashboard's server functions (extensions.md section 12.5): a turn of the insights agent, which AG
// Studio's loop asks for from the browser, and saving the shop's own dashboard. Built by shopAction, which checks who is asking and their role, limits how
// often a shop asks, and writes the audit line. A test checks that this file exports nothing else.

const DECIDERS = ['owner', 'manager'] as const
// Studio's agents take several short turns for each question, so a shop gets a hundred and twenty in a quarter hour.
const TURNS = { name: 'insights-turn', max: 120, windowSeconds: 15 * 60 } as const

const json = (limit: number) =>
  z
    .string()
    .max(limit)
    .transform((value, context) => {
      try {
        return JSON.parse(value) as unknown
      } catch {
        context.addIssue({ code: 'custom', message: 'Not JSON.' })
        return z.NEVER
      }
    })
const turn = json(INSIGHTS_TURN_CHARACTERS).pipe(studioTurnSchema)
// AG Studio's state as it hands it over: its pages and what it remembers of its panels. Studio checks the rest when it
// loads it again; anything else at the top is refused.
const dashboardState = json(500_000).pipe(
  z.strictObject({
    pages: z.array(z.record(z.string(), z.unknown())).max(20),
    selectedPageId: z.string().max(200),
    panels: z.record(z.string(), z.unknown()).optional(),
    schema: z.unknown().optional(),
    version: z.unknown().optional(),
  }),
)
// Saves follow the person's changes a moment after each, so a shop gets two hundred and forty a quarter hour.
const SAVES = { name: 'insights-save', max: 240, windowSeconds: 15 * 60 } as const

export const askInsights = shopAction(
  {
    name: 'insights.turn',
    roles: DECIDERS,
    needsPasskey: false,
    rateLimit: TURNS,
    // This shop's, this network's and every shop's share of the day: a turn counts once asked for, even if the model then fails.
    dailyCaps: { refusal: 'insights_daily_cap', shares: (context, network, day) => [{ limit: INSIGHTS_LIMITS.perShop, subject: context.shop.id }, { limit: INSIGHTS_LIMITS.perNetwork, subject: network }, { limit: INSIGHTS_LIMITS.perDay, subject: day }] },
    input: z.strictObject({ turn }),
    auditDetail: (result: Awaited<ReturnType<typeof runInsightsTurn>>) => ({ outcome: result.outcome, model: result.model, promptVersion: result.promptVersion, tokens: result.tokens, kept: result.kept, dropped: result.dropped, ...(result.reason === undefined ? {} : { reason: result.reason }) }),
  },
  async (_context, input, transaction) => {
    // A shop's turns of the last day must have tokens left before another model call is made.
    const now = new Date()
    if (!withinInsightsBudget(await insightsTokensSince(transaction, new Date(now.getTime() - INSIGHTS_BUDGET_HOURS * 60 * 60 * 1000)))) return new Refusal('insights_budget_spent')
    const { config } = await getServices()
    const model = config.services === 'fake' ? createScriptedInsightsModel() : createBedrockInsightsModel({ awsRegion: config.region })
    return runInsightsTurn({ model, turn: input.turn, now })
  },
)

// The shop's own dashboard, as the owner or manager left it, kept for the next visit with the report it was built on.
export const saveInsightsDashboard = shopAction(
  { name: 'insights.dashboard_saved', roles: DECIDERS, needsPasskey: false, rateLimit: SAVES, input: z.strictObject({ state: dashboardState, reportVersion: z.coerce.number().int().min(1).max(1000) }) },
  async (context, input, transaction) => {
    await saveDashboard(transaction, { shopId: context.shop.id, userId: context.person.userId, state: input.state, reportVersion: input.reportVersion, at: new Date() })
    return { saved: true }
  },
)

