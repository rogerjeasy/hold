import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBedrockComparisonModel } from './bedrock-model.ts'

describe('the comparison model adapter', () => {
  afterEach(() => { vi.useRealTimers() })
  // Opus 4.6 on Bedrock took 13 to over 30 seconds a look with two photographs, measured 27 October 2026.
  it('waits for a slow look inside the inspection ceiling instead of calling it unavailable', async () => {
    vi.useFakeTimers()
    const answer = () => new Response(JSON.stringify({ id: 'msg_slow', type: 'message', role: 'assistant', model: 'claude-opus-4-6', content: [{ type: 'text', text: JSON.stringify({ sameItem: true, sameView: true, findings: [] }) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 } }), { headers: { 'content-type': 'application/json' } })
    const model = createBedrockComparisonModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: (_to, options) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { resolve(answer()) }, 45_000)
      options?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')) })
    }) })
    const look = model.look({ kind: 'first', context: '{}', images: [] }, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(46_000)
    expect(await look).toMatchObject({ kind: 'result' })
  })
  it('uses structured output and explicit effort, records the served model, and has no tools', async () => {
    let sent: unknown
    let url = ''
    const model = createBedrockComparisonModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: (to, options) => {
      url = (to instanceof Request ? to.url : to.toString())
      if (typeof options?.body !== 'string') throw new Error('Expected a JSON request body')
      sent = JSON.parse(options.body) as unknown
      return Promise.resolve(new Response(JSON.stringify({ id: 'msg_recorded', type: 'message', role: 'assistant', model: 'claude-opus-4-6', content: [{ type: 'text', text: JSON.stringify({ sameItem: true, sameView: true, findings: [] }) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 } }), { headers: { 'content-type': 'application/json' } }))
    } })
    expect(await model.look({ kind: 'first', context: '{}', images: [] }, new AbortController().signal)).toMatchObject({ kind: 'result', model: 'claude-opus-4-6', data: { findings: [] } })
    expect(url).toContain('/model/us.anthropic.claude-opus-4-6-v1/invoke')
    expect(sent).toMatchObject({ thinking: { type: 'adaptive' }, output_config: { effort: 'high', format: { type: 'json_schema' } }, max_tokens: 4096 })
    expect(sent).not.toHaveProperty('tools')
  })
  // Bedrock refuses with 429 once the account's daily tokens are spent (29 October 2026). That is not a property of the
  // photographs, so it is told apart from a look that failed: an evaluation must stop rather than count it as deferral.
  it('reports a look Bedrock refused for capacity as throttled, apart from any other failure', async () => {
    const answering = (status: number) => createBedrockComparisonModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: () => Promise.resolve(new Response(JSON.stringify({ message: 'Too many tokens per day, please wait before trying again.' }), { status, headers: { 'content-type': 'application/json' } })) })
    expect(await answering(429).look({ kind: 'first', context: '{}', images: [] }, new AbortController().signal)).toMatchObject({ kind: 'throttled' })
    expect(await answering(500).look({ kind: 'first', context: '{}', images: [] }, new AbortController().signal)).toMatchObject({ kind: 'unavailable' })
  })
  it('handles a refusal without treating it as a clean inspection', async () => {
    const model = createBedrockComparisonModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: () => Promise.resolve(new Response(JSON.stringify({ id: 'msg_refused', type: 'message', role: 'assistant', model: 'claude-opus-4-6', content: [], stop_reason: 'refusal', stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } }), { headers: { 'content-type': 'application/json' } })) })
    expect(await model.look({ kind: 'second', context: '', images: [] }, new AbortController().signal)).toMatchObject({ kind: 'refused' })
  })
})
