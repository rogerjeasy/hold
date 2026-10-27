import { describe, expect, it } from 'vitest'
import { createBedrockInvestigator } from './bedrock-investigator.ts'
import type { GatedTools, InvestigationRequest } from './investigator.ts'

const message = (fields: Readonly<Record<string, unknown>>) => new Response(JSON.stringify({ id: 'msg_recorded', type: 'message', role: 'assistant', model: 'claude-opus-4-6', stop_sequence: null, usage: { input_tokens: 200, output_tokens: 40 }, ...fields }), { headers: { 'content-type': 'application/json' } })
const toolUse = (id: string, name: string, input: Readonly<Record<string, unknown>>) => message({ content: [{ type: 'tool_use', id, name, input }], stop_reason: 'tool_use' })
const ANSWER = { proposalKind: 'request_replacement_hold', reason: 'The hold ends in two days and the bike is out.', references: ['AUTH-1'], draft: null, paypalConfirmed: true, observations: [] }

const request: InvestigationRequest = { exceptionKind: 'hold_ending', allowed: ['request_replacement_hold'], deadline: new Date('2026-10-22T03:00:00Z'), facts: '{"hold":{"state":"placed"}}', rules: [], paypalAvailable: true }
const tools = (calls: string[]): GatedTools => ({
  tools: [{ name: 'get_order', description: 'Read an order', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } }],
  call: (name, args) => { calls.push(`${name} ${JSON.stringify(args)}`); return Promise.resolve('{"status":"COMPLETED"}') },
})

describe('the operations investigator adapter', () => {
  it('runs the model\'s tool calls through the gated tools, then reads its structured answer', async () => {
    const sent: { tools?: unknown; output_config?: unknown; tool_choice?: unknown; messages: { content: unknown }[] }[] = []
    const urls: string[] = []
    const replies = [toolUse('toolu_1', 'get_order', { id: 'HOLD-1' }), message({ content: [{ type: 'text', text: JSON.stringify(ANSWER) }], stop_reason: 'end_turn' })]
    const investigator = createBedrockInvestigator({ awsRegion: 'us-east-1', skipAuth: true, fetch: (to, options) => {
      urls.push((to instanceof Request ? to.url : to.toString()))
      if (typeof options?.body !== 'string') throw new Error('Expected a JSON request body')
      sent.push(JSON.parse(options.body) as (typeof sent)[number])
      const reply = replies.shift()
      if (reply === undefined) throw new Error('No more recorded replies')
      return Promise.resolve(reply)
    } })
    const calls: string[] = []
    const result = await investigator.investigate(request, tools(calls), { toolCalls: 6, signal: new AbortController().signal })
    expect(result).toEqual({ kind: 'result', data: ANSWER, model: 'claude-opus-4-6', inputTokens: 400, outputTokens: 80 })
    expect(calls).toEqual(['get_order {"id":"HOLD-1"}'])
    expect(urls[0]).toContain('/model/us.anthropic.claude-opus-4-6-v1/invoke')
    expect(sent[0]).toMatchObject({ thinking: { type: 'adaptive' }, tool_choice: { type: 'auto' }, output_config: { effort: 'medium', format: { type: 'json_schema' } }, tools: [{ name: 'get_order' }] })
    expect(JSON.stringify(sent[1]?.messages.at(-1)?.content)).toContain('tool_result')
  })

  it('stops calling tools at the exception\'s limit and tells the model so', async () => {
    const replies = [toolUse('toolu_1', 'get_order', {}), toolUse('toolu_2', 'get_order', {}), message({ content: [{ type: 'text', text: JSON.stringify(ANSWER) }], stop_reason: 'end_turn' })]
    const bodies: string[] = []
    const investigator = createBedrockInvestigator({ awsRegion: 'us-east-1', skipAuth: true, fetch: (_url, options) => { bodies.push(typeof options?.body === 'string' ? options.body : ''); return Promise.resolve(replies.shift() ?? message({ content: [], stop_reason: 'end_turn' })) } })
    const calls: string[] = []
    await investigator.investigate(request, tools(calls), { toolCalls: 1, signal: new AbortController().signal })
    expect(calls).toHaveLength(1)
    expect(bodies[2]).toMatch(/limit/)
  })

  it('treats a refusal as a normal outcome', async () => {
    const investigator = createBedrockInvestigator({ awsRegion: 'us-east-1', skipAuth: true, fetch: () => Promise.resolve(message({ content: [], stop_reason: 'refusal' })) })
    expect(await investigator.investigate(request, tools([]), { toolCalls: 6, signal: new AbortController().signal })).toMatchObject({ kind: 'refused' })
  })

  it('reports Bedrock being down as unavailable, not as an answer', async () => {
    const investigator = createBedrockInvestigator({ awsRegion: 'us-east-1', skipAuth: true, fetch: () => Promise.resolve(new Response('{"message":"down"}', { status: 503 })) })
    expect(await investigator.investigate(request, tools([]), { toolCalls: 6, signal: new AbortController().signal })).toMatchObject({ kind: 'unavailable' })
  })
})
