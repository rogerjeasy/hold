'use server'

import { createBedrockInsightsModel, createScriptedInsightsModel, runInsightsTurn, studioTurnSchema } from '@hold/agent'
import { saveInsightsDashboard as saveDashboard } from '@hold/db'
import { z } from 'zod'
import { getServices } from '@/server/services'
import { shopAction } from '@/server/shop-access'

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
const turn = json(1_000_000).pipe(studioTurnSchema)
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
    input: z.strictObject({ turn }),
    auditDetail: (result: Awaited<ReturnType<typeof runInsightsTurn>>) => ({ outcome: result.outcome, model: result.model, promptVersion: result.promptVersion, tokens: result.tokens, kept: result.kept, dropped: result.dropped, ...(result.reason === undefined ? {} : { reason: result.reason }) }),
  },
  async (_context, input) => {
    const { config } = await getServices()
    const model = config.services === 'fake' ? createScriptedInsightsModel() : createBedrockInsightsModel({ awsRegion: config.region })
    return runInsightsTurn({ model, turn: input.turn, now: new Date() })
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

