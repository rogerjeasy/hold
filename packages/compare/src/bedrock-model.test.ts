import { describe, expect, it } from 'vitest'
import { createBedrockComparisonModel } from './bedrock-model.ts'

describe('the comparison model adapter', () => {
  it('uses structured output and explicit effort, records the served model, and has no tools', async () => {
    let sent: unknown
    const model = createBedrockComparisonModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: (_url, options) => {
      if (typeof options?.body !== 'string') throw new Error('Expected a JSON request body')
      sent = JSON.parse(options.body) as unknown
      return Promise.resolve(new Response(JSON.stringify({ id: 'msg_recorded', type: 'message', role: 'assistant', model: 'anthropic.claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify({ sameItem: true, sameView: true, findings: [] }) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 } }), { headers: { 'content-type': 'application/json' } }))
    } })
    expect(await model.look({ kind: 'first', context: '{}', images: [] }, new AbortController().signal)).toMatchObject({ kind: 'result', model: 'anthropic.claude-opus-5-5', data: { findings: [] } })
    expect(sent).toMatchObject({ model: 'anthropic.claude-opus-5-5', output_config: { effort: 'high', format: { type: 'json_schema' } }, max_tokens: 4096 })
    expect(sent).not.toHaveProperty('tools')
  })
  it('handles a refusal without treating it as a clean inspection', async () => {
    const model = createBedrockComparisonModel({ awsRegion: 'us-east-1', skipAuth: true, fetch: () => Promise.resolve(new Response(JSON.stringify({ id: 'msg_refused', type: 'message', role: 'assistant', model: 'anthropic.claude-opus-5-5', content: [], stop_reason: 'refusal', stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } }), { headers: { 'content-type': 'application/json' } })) })
    expect(await model.look({ kind: 'second', context: '', images: [] }, new AbortController().signal)).toMatchObject({ kind: 'refused' })
  })
})
