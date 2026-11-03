import type { InsightsReply, InsightsRequest } from './insights-protocol.ts'
import { AGENT_MODEL_PROFILE } from '@hold/domain'

// The insights agent's model (extensions.md section 12.5): Claude Opus 4.6 on Bedrock through judging (AGENTS.md
// section 8), reached only through this port. In the test environment a script answers, and says it is simulated.

// Opus 4.5, as every agent runs: its daily token limit is the larger (packages/domain claude-models.ts).
export const INSIGHTS_MODEL = AGENT_MODEL_PROFILE
export const INSIGHTS_PROMPT_VERSION = 'insights-3'
// One turn's ceiling. AG Studio's loop asks for many short turns: reading the schema, a query, placing a widget.
export const INSIGHTS_MAX_TOKENS = 4096

// What Hold tells the agent before AG Studio's own instructions for each of its agents.
export const INSIGHTS_INSTRUCTIONS = [
  'You are the insights agent for a rental shop using Hold, working inside the shop’s own dashboard.',
  'The tables are the shop’s own records of money, rentals and items: amounts are in the shop’s currency, and no renter is named in them.',
  'You can read those tables and arrange the dashboard: add, change, place or remove widgets and filters. You cannot change any record of the shop, and nothing you do moves money.',
  // Live on 29 October 2026, asked to add a pie chart, Studio's agents first removed the bar chart beside it, then,
  // told only not to remove one, turned that bar chart into the pie.
  'When the person asks for a new widget, place a new widget with an id of its own. Leave every widget already on the page as it is: never remove one, and never change its type, fields or title, unless the person asks for that widget to change or go.',
  'Every number you state must come from a tool result in this conversation. Never estimate or invent one. When the tables cannot answer a question, say so plainly.',
].join(' ')

export type InsightsModelRequest = InsightsRequest & { readonly maxTokens: number }
export type InsightsModelReply = { readonly kind: 'reply'; readonly reply: InsightsReply } | { readonly kind: 'refused'; readonly model: string } | { readonly kind: 'unavailable'; readonly model: string; readonly reason: string }

export type InsightsModel = {
  readonly simulated: boolean
  reply(request: InsightsModelRequest, signal?: AbortSignal): Promise<InsightsModelReply>
}

// The test environment's stand-in: one short answer, no tool, no model asked.
export function createScriptedInsightsModel(): InsightsModel {
  return {
    simulated: true,
    reply: () => Promise.resolve({
      kind: 'reply',
      reply: { id: 'simulated', model: 'simulated', stopReason: 'end_turn', usage: { inputTokens: 0, outputTokens: 0 }, content: [{ type: 'text', text: 'Simulated answer: in this test environment no model is asked, so the dashboard stays as it is.' }] },
    }),
  }
}
