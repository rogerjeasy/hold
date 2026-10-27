import { describe, expect, it } from 'vitest'
import { createBedrockAdvocateModel } from './bedrock-advocate-model.ts'

// Recorded Bedrock replies, played back through the client's fetch.
function recorded(body: Readonly<Record<string, unknown>>, seen: unknown[] = [], urls: string[] = []) {
  return createBedrockAdvocateModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: (to, options) => {
    urls.push((to instanceof Request ? to.url : to.toString()))
    if (typeof options?.body !== 'string') throw new Error('Expected a JSON request body')
    seen.push(JSON.parse(options.body) as unknown)
    return Promise.resolve(new Response(JSON.stringify({ id: 'msg_recorded', type: 'message', role: 'assistant', model: 'claude-opus-4-6', stop_sequence: null, usage: { input_tokens: 900, output_tokens: 120 }, ...body }), { headers: { 'content-type': 'application/json' } }))
  } })
}
const request = { side: 'renter' as const, system: 'You are the renter’s advocate.', message: '<negotiation>{}</negotiation>' }

describe('the advocate model adapter', () => {
  it('offers exactly the three tools, without strict mode, with automatic choice and explicit effort, and returns the move', async () => {
    const seen: unknown[] = []
    const urls: string[] = []
    const model = recorded({ content: [{ type: 'tool_use', id: 'toolu_1', name: 'offer', input: { lines: [] } }], stop_reason: 'tool_use' }, seen, urls)
    expect(await model.move(request, new AbortController().signal)).toEqual({ kind: 'move', tool: 'offer', input: { lines: [] }, model: 'claude-opus-4-6', inputTokens: 900, outputTokens: 120 })
    expect(urls[0]).toContain('/model/us.anthropic.claude-opus-4-6-v1/invoke')
    expect(seen[0]).toMatchObject({ thinking: { type: 'adaptive' }, tool_choice: { type: 'auto' }, output_config: { effort: 'medium' }, system: request.system, messages: [{ role: 'user', content: [{ type: 'text', text: request.message }] }] })
    // Strict mode costs Opus 4.6 on Bedrock about 15 seconds a move to compile; the referee checks every argument anyway.
    const tools = (seen[0] as { readonly tools: readonly { readonly name: string; readonly strict?: boolean; readonly input_schema: { readonly additionalProperties: boolean } }[] }).tools
    expect(tools.map((tool) => [tool.name, tool.strict ?? false, tool.input_schema.additionalProperties])).toEqual([['offer', false, false], ['accept', false, false], ['pass', false, false]])
  })

  it('treats a refusal as a normal outcome, and an answer without a move as no move', async () => {
    expect(await recorded({ content: [], stop_reason: 'refusal' }).move(request, new AbortController().signal)).toMatchObject({ kind: 'refused' })
    expect(await recorded({ content: [{ type: 'text', text: 'I accept 50.' }], stop_reason: 'end_turn' }).move(request, new AbortController().signal)).toMatchObject({ kind: 'no_move' })
    expect(await recorded({ content: [{ type: 'tool_use', id: 'toolu_2', name: 'capture', input: {} }], stop_reason: 'tool_use' }).move(request, new AbortController().signal)).toMatchObject({ kind: 'no_move' })
  })

  it('is unavailable when Bedrock cannot be reached', async () => {
    const model = createBedrockAdvocateModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: () => Promise.reject(new TypeError('network down')) })
    expect(await model.move(request, new AbortController().signal)).toMatchObject({ kind: 'unavailable' })
  })
})
