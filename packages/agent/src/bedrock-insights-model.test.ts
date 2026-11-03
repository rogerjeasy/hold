import { describe, expect, it } from 'vitest'
import { createBedrockInsightsModel } from './bedrock-insights-model.ts'
import type { InsightsModelRequest } from './insights-model.ts'

// The insights agent's Bedrock adapter (extensions.md section 12.5), against recorded replies.

const recorded = (body: Record<string, unknown>, status = 200) => () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
const message = (content: unknown[], stopReason: string) => ({ id: 'msg_recorded', type: 'message', role: 'assistant', model: 'claude-opus-4-6', content, stop_reason: stopReason, stop_sequence: null, usage: { input_tokens: 1500, output_tokens: 70 } })

const request: InsightsModelRequest = {
  system: 'You are the insights agent.',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Show damage by item type.' }] }],
  // AG Studio's schemas use references and unions; they go as they are, never in strict mode.
  tools: [{ name: 'add_widget', description: 'Add a widget.', inputSchema: { type: 'object', properties: { type: { $ref: '#/$defs/widgetType' } }, $defs: { widgetType: { enum: ['bar-chart-grouped', 'grid'] } } } }],
  toolChoice: { type: 'tool', name: 'add_widget' },
  maxTokens: 4096,
}

describe('the insights agent’s Bedrock adapter', () => {
  it('sends Opus 4.5 the turn with its tool choice, explicit effort, no thinking and no strict tools, and returns the reply', async () => {
    let sent: Record<string, unknown> = {}
    let url = ''
    const model = createBedrockInsightsModel({
      awsRegion: 'us-east-1',
      skipAuth: true,
      fetch: (to, options) => {
        url = to instanceof Request ? to.url : to.toString()
        if (typeof options?.body !== 'string') throw new Error('Expected a JSON request body')
        sent = JSON.parse(options.body) as Record<string, unknown>
        return recorded(message([{ type: 'text', text: 'Adding it.' }, { type: 'tool_use', id: 'toolu_1', name: 'add_widget', input: { type: 'grid' } }], 'tool_use'))()
      },
    })
    expect(await model.reply(request)).toEqual({ kind: 'reply', reply: { id: 'msg_recorded', model: 'claude-opus-4-6', stopReason: 'tool_use', usage: { inputTokens: 1500, outputTokens: 70 }, content: [{ type: 'text', text: 'Adding it.' }, { type: 'tool_use', id: 'toolu_1', name: 'add_widget', input: { type: 'grid' } }] } })
    expect(url).toContain('/model/us.anthropic.claude-opus-4-5-20251101-v1')
    expect(sent).toMatchObject({ anthropic_beta: ['effort-2025-11-24'], max_tokens: 4096, system: 'You are the insights agent.', tool_choice: { type: 'tool', name: 'add_widget' }, output_config: { effort: 'medium' } })
    expect(sent).not.toHaveProperty('thinking')
    expect(sent).not.toHaveProperty('temperature')
    const [tool] = sent['tools'] as Record<string, unknown>[]
    expect(tool).toEqual({ name: 'add_widget', description: 'Add a widget.', input_schema: request.tools[0]?.inputSchema })
  })

  it('takes a refusal as a refusal, and an error or a cancelled turn as unreachable', async () => {
    expect(await createBedrockInsightsModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: recorded(message([], 'refusal')) }).reply(request)).toMatchObject({ kind: 'refused' })
    expect(await createBedrockInsightsModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: recorded({ type: 'error', error: { type: 'overloaded_error', message: 'busy' } }, 529) }).reply(request)).toMatchObject({ kind: 'unavailable', reason: '529 overloaded_error: busy' })
    const cancelled = new AbortController()
    cancelled.abort()
    expect(await createBedrockInsightsModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: recorded(message([], 'end_turn')) }).reply(request, cancelled.signal)).toMatchObject({ kind: 'unavailable', reason: 'cancelled' })
  })

  it('says why a turn was refused by Bedrock, in a line short enough for the audit trail', async () => {
    const long = `messages: ${'x'.repeat(500)}`
    const answer = await createBedrockInsightsModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: recorded({ message: long }, 400) }).reply(request)
    expect(answer).toMatchObject({ kind: 'unavailable' })
    expect(answer.kind === 'unavailable' ? answer.reason : '').toMatch(/^400 .*messages: x+$/)
    expect(answer.kind === 'unavailable' ? answer.reason.length : 0).toBeLessThanOrEqual(240)
  })
})
