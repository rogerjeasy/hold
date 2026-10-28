import { describe, expect, it } from 'vitest'
import type { AdvocateRequest } from './advocate-model.ts'
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
const request: AdvocateRequest = { side: 'renter', system: 'You are the renter’s advocate.', messages: [{ role: 'user', text: 'It is your move.' }] }
const signal = () => new AbortController().signal

describe('the advocate model adapter', () => {
  it('offers the read-only tools and the three moves, without strict mode, with automatic choice and explicit effort', async () => {
    const seen: unknown[] = []
    const urls: string[] = []
    const content = [{ type: 'thinking', thinking: 'Read the lines first.', signature: 'sig' }, { type: 'tool_use', id: 'toolu_1', name: 'get_claim_lines', input: {} }]
    const model = recorded({ content, stop_reason: 'tool_use' }, seen, urls)
    expect(await model.next(request, signal())).toEqual({ kind: 'calls', calls: [{ id: 'toolu_1', name: 'get_claim_lines', input: {} }], raw: content, model: 'claude-opus-4-6', inputTokens: 900, outputTokens: 120 })
    expect(urls[0]).toContain('/model/us.anthropic.claude-opus-4-6-v1/invoke')
    expect(seen[0]).toMatchObject({ thinking: { type: 'adaptive' }, tool_choice: { type: 'auto' }, output_config: { effort: 'medium' }, system: request.system, messages: [{ role: 'user', content: [{ type: 'text', text: 'It is your move.' }] }] })
    // Strict mode costs Opus 4.6 on Bedrock many seconds a move to compile; the referee checks every argument anyway.
    const tools = (seen[0] as { readonly tools: readonly { readonly name: string; readonly strict?: boolean; readonly input_schema: { readonly additionalProperties: boolean } }[] }).tools
    expect(tools.map((tool) => [tool.name, tool.strict ?? false, tool.input_schema.additionalProperties])).toEqual(
      ['get_negotiation', 'get_claim_lines', 'get_line_photos', 'get_price_list', 'get_known_marks', 'get_condition_report', 'offer', 'accept', 'pass'].map((name) => [name, false, false]),
    )
  })

  it('sends the model’s own turn back as it came, and each tool’s result, photographs as images', async () => {
    const seen: unknown[] = []
    const raw = [{ type: 'thinking', thinking: 'Look at the photographs.', signature: 'sig' }, { type: 'tool_use', id: 'toolu_1', name: 'get_line_photos', input: { lineId: 'line-1' } }]
    await recorded({ content: [{ type: 'tool_use', id: 'toolu_2', name: 'pass', input: {} }], stop_reason: 'tool_use' }, seen).next({
      ...request,
      messages: [...request.messages, { role: 'assistant', calls: [{ id: 'toolu_1', name: 'get_line_photos', input: { lineId: 'line-1' } }], raw }, { role: 'tool_results', results: [{ callId: 'toolu_1', parts: [{ type: 'text', text: 'The handover photograph:' }, { type: 'image', image: { mediaType: 'image/jpeg', data: '/9j/AAAA' } }], isError: false }] }],
    }, signal())
    expect((seen[0] as { readonly messages: unknown }).messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'It is your move.' }] },
      { role: 'assistant', content: raw },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', is_error: false, content: [{ type: 'text', text: 'The handover photograph:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/AAAA' } }] }] },
    ])
  })

  it('treats a refusal as a normal outcome, and an answer without a tool as no move', async () => {
    expect(await recorded({ content: [], stop_reason: 'refusal' }).next(request, signal())).toMatchObject({ kind: 'refused' })
    expect(await recorded({ content: [{ type: 'text', text: 'I accept 50.' }], stop_reason: 'end_turn' }).next(request, signal())).toMatchObject({ kind: 'no_move' })
    expect(await recorded({ content: [{ type: 'tool_use', id: 'toolu_3', name: 'offer', input: {} }], stop_reason: 'max_tokens' }).next(request, signal())).toMatchObject({ kind: 'no_move' })
  })

  it('is unavailable when Bedrock cannot be reached', async () => {
    const model = createBedrockAdvocateModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: () => Promise.reject(new TypeError('network down')) })
    expect(await model.next(request, signal())).toMatchObject({ kind: 'unavailable' })
  })
})
