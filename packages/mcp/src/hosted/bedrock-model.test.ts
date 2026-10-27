import { describe, expect, it } from 'vitest'
import { createBedrockAssistantModel } from './bedrock-model.ts'
import type { ModelRequest } from './model.ts'

const recorded = (body: Record<string, unknown>, status = 200) => () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
const message = (content: unknown[], stopReason: string) => ({ id: 'msg_recorded', type: 'message', role: 'assistant', model: 'claude-opus-4-6', content, stop_reason: stopReason, stop_sequence: null, usage: { input_tokens: 900, output_tokens: 60 } })

const request: ModelRequest = {
  system: 'You are a demonstration assistant.',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Book me an e-bike.' }] }],
  tools: [{ name: 'quote_rental', description: 'A quote.', inputSchema: { type: 'object', properties: { shop: { type: 'string', minLength: 1, maxLength: 80, pattern: '^[a-z0-9-]+$' } }, required: ['shop'], additionalProperties: false } }],
  maxTokens: 1500,
}

describe('the hosted assistant’s Bedrock adapter', () => {
  it('sends strict tools, automatic tool choice and explicit effort, and returns the model’s tool calls', async () => {
    let sent: Record<string, unknown> = {}
    let url = ''
    const model = createBedrockAssistantModel({
      awsRegion: 'us-east-1',
      skipAuth: true,
      fetch: (to, options) => {
        url = (to instanceof Request ? to.url : to.toString())
        if (typeof options?.body !== 'string') throw new Error('Expected a JSON request body')
        sent = JSON.parse(options.body) as Record<string, unknown>
        return recorded(message([{ type: 'tool_use', id: 'toolu_1', name: 'quote_rental', input: { shop: 'ribeira-bikes' } }], 'tool_use'))()
      },
    })
    expect(await model.reply(request, new AbortController().signal)).toEqual({ kind: 'reply', content: [{ type: 'tool_use', id: 'toolu_1', name: 'quote_rental', input: { shop: 'ribeira-bikes' } }], stopReason: 'tool_use', tokens: 960, model: 'claude-opus-4-6' })
    expect(url).toContain('/model/us.anthropic.claude-opus-4-6-v1/invoke')
    expect(sent).toMatchObject({ max_tokens: 1500, tool_choice: { type: 'auto' }, output_config: { effort: 'medium' }, system: 'You are a demonstration assistant.' })
    const [tool] = sent['tools'] as Record<string, unknown>[]
    expect(tool).toMatchObject({ name: 'quote_rental', strict: true, input_schema: { type: 'object', additionalProperties: false, required: ['shop'] } })
    // Constraints strict schemas cannot carry are kept as words for the model; the server still checks them.
    expect(JSON.stringify(tool?.['input_schema'])).not.toContain('"maxLength"')
  })

  it('takes a refusal as a refusal, and an error or a timeout as unreachable', async () => {
    expect(await createBedrockAssistantModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: recorded(message([], 'refusal')) }).reply(request, new AbortController().signal)).toMatchObject({ kind: 'refused' })
    expect(await createBedrockAssistantModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: recorded({ type: 'error', error: { type: 'overloaded_error', message: 'busy' } }, 529) }).reply(request, new AbortController().signal)).toMatchObject({ kind: 'unavailable' })
    const aborted = new AbortController()
    aborted.abort()
    expect(await createBedrockAssistantModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: recorded(message([], 'end_turn')) }).reply(request, aborted.signal)).toMatchObject({ kind: 'unavailable' })
  })
})
