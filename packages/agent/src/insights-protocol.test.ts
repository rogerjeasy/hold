import { describe, expect, it } from 'vitest'
import { insightsRequest, insightsResponse, studioTurnSchema } from './insights-protocol.ts'

// One turn of the insights agent (extensions.md section 12.5): AG Studio's conversation, as its own agent loop sends it
// from the browser, read into Claude's Messages API, and Claude's reply read back into what Studio's loop expects.

const turn = studioTurnSchema.parse({
  instructions: 'You arrange the dashboard.',
  input: [
    { id: 'm1', kind: 'input', type: 'message', role: 'system', status: 'completed', content: [{ type: 'text', text: 'The page has two widgets.' }] },
    { id: 'm2', kind: 'input', type: 'message', role: 'user', status: 'completed', content: [{ type: 'text', text: 'Show damage by item type.' }] },
    { id: 'o1', kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'text', text: 'Let me look.', annotations: [] }] },
    { id: 'c1', kind: 'output', type: 'function_call', callId: 'toolu_1', name: 'view_schema', arguments: '{}', status: 'completed' },
    { id: 'c2', kind: 'output', type: 'function_call', callId: 'toolu_2', name: 'view_page', arguments: '{"pageId":"overview"}', status: 'completed' },
    { kind: 'input', type: 'function_call_output', callId: 'toolu_1', output: '{"tables":["items"]}', status: 'completed' },
    { kind: 'input', type: 'function_call_output', callId: 'toolu_2', output: 'two widgets', status: 'completed' },
    { id: 'r1', kind: 'output', type: 'reasoning', summary: [] },
  ],
  tools: [
    { name: 'view_schema', description: 'Read the schema.', parameters: { type: 'object', properties: {} } },
    { name: 'add_widget', description: 'Add a widget.', parameters: { type: 'object', properties: { type: { type: 'string' } } } },
    { name: 'provided_search', description: 'A provider tool.', parameters: {}, kind: 'provided' },
  ],
  toolChoice: { name: 'add_widget' },
})

describe('a turn read into Claude’s Messages API', () => {
  it('puts the instructions and the system messages in the system prompt after Hold’s own, the rest in turns', () => {
    const request = insightsRequest(turn, 'HOLD RULES')
    expect(request.system).toBe('HOLD RULES\n\nYou arrange the dashboard.\n\nThe page has two widgets.')
    expect(request.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Show damage by item type.' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Let me look.' }, { type: 'tool_use', id: 'toolu_1', name: 'view_schema', input: {} }, { type: 'tool_use', id: 'toolu_2', name: 'view_page', input: { pageId: 'overview' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"tables":["items"]}' }, { type: 'tool_result', tool_use_id: 'toolu_2', content: 'two widgets' }] },
    ])
  })

  it('offers the tools Studio runs in the browser, never a provider’s own, and forces a tool when Studio asks', () => {
    const request = insightsRequest(turn, 'HOLD RULES')
    expect(request.tools.map((tool) => tool.name)).toEqual(['view_schema', 'add_widget'])
    expect(request.tools[0]).toEqual({ name: 'view_schema', description: 'Read the schema.', inputSchema: { type: 'object', properties: {} } })
    expect(request.toolChoice).toEqual({ type: 'tool', name: 'add_widget' })
    expect(insightsRequest({ ...turn, toolChoice: 'required' }, '').toolChoice).toEqual({ type: 'any' })
    expect(insightsRequest({ ...turn, toolChoice: undefined }, '').toolChoice).toEqual({ type: 'auto' })
  })

  it('ends on the person’s side when Studio’s turn ends on the agent’s own words, since Opus 4.6 takes no prefill', () => {
    // Live on 29 October 2026: a delegated agent answered in words alone, Studio asked again from those words, and
    // Bedrock refused the turn: "This model does not support assistant message prefill."
    const endsOnAgent = studioTurnSchema.parse({
      input: [
        { type: 'message', role: 'user', content: [{ type: 'text', text: 'Place a pie chart.' }] },
        { type: 'message', role: 'assistant', content: [{ type: 'text', text: 'I will place it.' }] },
      ],
    })
    const request = insightsRequest(endsOnAgent, '')
    expect(request.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user'])
    expect(request.messages[1]).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'I will place it.' }] })
    expect(request.messages[2]).toEqual({ role: 'user', content: [{ type: 'text', text: 'Carry on with the task from where you left off.' }] })
    expect(insightsRequest(turn, '').messages.at(-1)?.role).toBe('user')
  })

  it('refuses a turn with fields Studio never sends, or arguments that are not JSON', () => {
    expect(studioTurnSchema.safeParse({ input: [], unknown: true }).success).toBe(false)
    const broken = studioTurnSchema.parse({ input: [{ type: 'function_call', callId: 'x', name: 'view_schema', arguments: '{nope' }] })
    expect(() => insightsRequest(broken, '')).toThrow()
  })
})

describe('Claude’s reply read back for Studio', () => {
  const reply = { id: 'msg_1', model: 'claude-opus-4-6', stopReason: 'tool_use', usage: { inputTokens: 1200, outputTokens: 80 }, content: [{ type: 'text' as const, text: 'Adding it.' }, { type: 'tool_use' as const, id: 'toolu_3', name: 'add_widget', input: { type: 'bar' } }, { type: 'tool_use' as const, id: 'toolu_4', name: 'capture_hold', input: {} }] }

  it('gives the text and each call the gate kept, in order, with the arguments as JSON text', () => {
    const response = insightsResponse(reply, ['toolu_3'], new Date('2026-10-29T10:00:00Z'))
    expect(response).toEqual({
      id: 'msg_1',
      createdAt: Date.parse('2026-10-29T10:00:00Z'),
      status: 'completed',
      model: 'claude-opus-4-6',
      usage: { inputTokens: 1200, outputTokens: 80, totalTokens: 1280 },
      output: [
        { id: 'msg_1-0', kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'text', text: 'Adding it.', annotations: [] }] },
        { id: 'toolu_3', kind: 'output', type: 'function_call', callId: 'toolu_3', name: 'add_widget', arguments: '{"type":"bar"}', status: 'completed' },
      ],
    })
  })

  it('says a reply cut short by its token ceiling is incomplete, and a refusal is a refusal', () => {
    expect(insightsResponse({ ...reply, stopReason: 'max_tokens' }, [], new Date(0))).toMatchObject({ status: 'incomplete', incompleteDetails: { reason: 'max_output_tokens' } })
    expect(insightsResponse({ ...reply, stopReason: 'refusal', content: [] }, [], new Date(0)).output).toEqual([{ id: 'msg_1-refusal', kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: 'The model declined to answer.' }] }])
  })
})
