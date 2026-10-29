import { describe, expect, it } from 'vitest'
import { gateInsightsCalls, INSIGHTS_DAILY_TOKENS, INSIGHTS_TOOLS, withinInsightsBudget } from './insights-gateway.ts'
import { TOOL_TIERS } from './agent-gateway.ts'

// The insights agent's gate (extensions.md section 12.5): every tool call the model asks for passes here, on Hold's
// server, before the dashboard in the browser carries it out. Only AG Studio's own dashboard tools pass, each read or
// draft, and only when the turn offered it.

describe('the insights agent’s tools', () => {
  it('are AG Studio’s dashboard tools, each reading or arranging the dashboard, none moving money', () => {
    for (const tier of Object.values(INSIGHTS_TOOLS)) expect(['read', 'draft']).toContain(tier)
    expect(TOOL_TIERS).toContain('read')
    expect(Object.keys(INSIGHTS_TOOLS).some((name) => /capture|charge|refund|release|pay|invoice|hold|mandate|approve/.test(name))).toBe(false)
  })
})

describe('gating the calls a turn asks for', () => {
  const offered = ['view_schema', 'execute_query', 'add_widget', 'delegate_to']

  it('passes a call to a dashboard tool the turn offered', () => {
    const gated = gateInsightsCalls([{ callId: 'a', name: 'execute_query' }, { callId: 'b', name: 'add_widget' }], offered)
    expect(gated.kept.map((call) => call.callId)).toEqual(['a', 'b'])
    expect(gated.dropped).toEqual([])
  })

  it('drops a call to a tool the turn did not offer, and one that is no dashboard tool at all, saying why', () => {
    const gated = gateInsightsCalls([{ callId: 'a', name: 'remove_widget' }, { callId: 'b', name: 'capture_hold' }, { callId: 'c', name: 'view_schema' }], [...offered, 'capture_hold'])
    expect(gated.kept.map((call) => call.callId)).toEqual(['c'])
    expect(gated.dropped).toEqual([{ callId: 'a', name: 'remove_widget', reason: 'not_offered' }, { callId: 'b', name: 'capture_hold', reason: 'not_a_dashboard_tool' }])
  })
})

describe('a shop’s budget for the insights agent', () => {
  it('lets a shop ask until its turns of the last day have spent the day’s tokens, then no more', () => {
    expect(INSIGHTS_DAILY_TOKENS).toBe(3_000_000)
    expect(withinInsightsBudget(0)).toBe(true)
    expect(withinInsightsBudget(INSIGHTS_DAILY_TOKENS - 1)).toBe(true)
    expect(withinInsightsBudget(INSIGHTS_DAILY_TOKENS)).toBe(false)
  })
})
