import { describe, expect, it } from 'vitest'
import { createScriptedInsightsModel, INSIGHTS_MAX_TOKENS, INSIGHTS_PROMPT_VERSION } from './insights-model.ts'
import type { InsightsModel, InsightsModelRequest } from './insights-model.ts'
import { studioTurnSchema } from './insights-protocol.ts'
import type { InsightsReply } from './insights-protocol.ts'
import { runInsightsTurn } from './run-insights-turn.ts'

// One turn of the insights agent through Hold's server (extensions.md section 12.5): Hold's own instructions, a token
// ceiling, one model call, and the gate on every call the model asks for, before anything goes back to the browser.

const NOW = new Date('2026-10-29T10:00:00Z')
const turn = studioTurnSchema.parse({
  instructions: 'Arrange the dashboard.',
  input: [{ type: 'message', role: 'user', content: [{ type: 'text', text: 'Which bikes cost me most?' }] }],
  tools: [{ name: 'execute_query', parameters: { type: 'object' } }, { name: 'add_widget', parameters: { type: 'object' } }],
})

function modelReplying(content: InsightsReply['content'], seen: InsightsModelRequest[] = []): InsightsModel {
  return {
    simulated: false,
    reply: (request) => {
      seen.push(request)
      return Promise.resolve({ kind: 'reply', reply: { id: 'msg_1', model: 'claude-opus-4-6', stopReason: 'tool_use', usage: { inputTokens: 900, outputTokens: 40 }, content } })
    },
  }
}

describe('a turn of the insights agent', () => {
  it('asks the model once with Hold’s instructions first and a token ceiling, and passes on the calls the gate keeps', async () => {
    const seen: InsightsModelRequest[] = []
    const model = modelReplying([{ type: 'text', text: 'Querying.' }, { type: 'tool_use', id: 't1', name: 'execute_query', input: {} }, { type: 'tool_use', id: 't2', name: 'release_hold', input: {} }], seen)
    const result = await runInsightsTurn({ model, turn, now: NOW })
    expect(seen).toHaveLength(1)
    expect(seen[0]?.maxTokens).toBe(INSIGHTS_MAX_TOKENS)
    expect(seen[0]?.system.startsWith('You are the insights agent')).toBe(true)
    expect(seen[0]?.system).toContain('Arrange the dashboard.')
    expect(result).toMatchObject({ outcome: 'answered', promptVersion: INSIGHTS_PROMPT_VERSION, model: 'claude-opus-4-6', tokens: 940, kept: ['execute_query'], dropped: [{ name: 'release_hold', reason: 'not_a_dashboard_tool' }] })
    expect(result.response.output.map((each) => each.type)).toEqual(['message', 'function_call'])
  })

  it('tells the model that adding a widget keeps the ones there: one goes only when the person asks for that', async () => {
    const seen: InsightsModelRequest[] = []
    await runInsightsTurn({ model: modelReplying([{ type: 'text', text: 'Adding.' }], seen), turn, now: NOW })
    expect(seen[0]?.system).toContain('place a new widget with an id of its own. Leave every widget already on the page as it is: never remove one, and never change its type, fields or title, unless the person asks for that widget to change or go.')
    expect(INSIGHTS_PROMPT_VERSION).toBe('insights-3')
  })

  it('tells Studio plainly when the model could not be reached or declined, and nothing else happens', async () => {
    const unreachable: InsightsModel = { simulated: false, reply: () => Promise.resolve({ kind: 'unavailable', model: 'claude-opus-4-6', reason: '529 overloaded_error: busy' }) }
    const result = await runInsightsTurn({ model: unreachable, turn, now: NOW })
    expect(result).toMatchObject({ outcome: 'unavailable', reason: '529 overloaded_error: busy', kept: [], response: { status: 'failed', error: { code: 'unavailable' }, output: [] } })
    const declining: InsightsModel = { simulated: false, reply: () => Promise.resolve({ kind: 'refused', model: 'claude-opus-4-6' }) }
    expect(await runInsightsTurn({ model: declining, turn, now: NOW })).toMatchObject({ outcome: 'refused', response: { status: 'completed', output: [{ content: [{ type: 'refusal' }] }] } })
  })

  it('in the test environment answers from a script that says it is simulated, asking no model', async () => {
    const result = await runInsightsTurn({ model: createScriptedInsightsModel(), turn, now: NOW })
    expect(result.outcome).toBe('answered')
    expect(result.simulated).toBe(true)
    expect(JSON.stringify(result.response.output)).toContain('Simulated')
  })
})
