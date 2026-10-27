import { describe, expect, it } from 'vitest'
import type { AssistantModel, Block, Conversation, ModelReply, ModelRequest } from './model.ts'
import { HOSTED_LIMITS, runHostedTurn } from './runner.ts'
import type { ToolClient } from './runner.ts'

// A model that answers from a list, one reply per call, and records what it was asked.
function scriptedReplies(replies: readonly ModelReply[]): AssistantModel & { readonly asked: ModelRequest[] } {
  const asked: ModelRequest[] = []
  let index = 0
  return {
    simulated: true,
    asked,
    reply(request) {
      asked.push(request)
      const reply = replies[Math.min(index, replies.length - 1)]
      index += 1
      if (reply === undefined) throw new Error('No reply.')
      return Promise.resolve(reply)
    },
  }
}

const turn = (content: readonly Block[], stopReason = 'end_turn', tokens = 100): ModelReply => ({ kind: 'reply', content, stopReason, tokens, model: 'test-model' })
const useTool = (id: string, name: string, input: Record<string, unknown> = {}): Block => ({ type: 'tool_use', id, name, input })

function toolClient(results: Readonly<Record<string, { readonly structuredContent?: Record<string, unknown>; readonly isError?: boolean }>> = {}): ToolClient & { readonly called: string[] } {
  const called: string[] = []
  return {
    called,
    listTools: () => Promise.resolve({ tools: [{ name: 'find_shops', description: 'Shops.', inputSchema: { type: 'object', properties: {} } }] }),
    callTool: ({ name }) => {
      called.push(name)
      const result = results[name] ?? { structuredContent: { ok: true } }
      return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(result.structuredContent ?? { error: 'refused' }) }], isError: result.isError, structuredContent: result.structuredContent })
    },
  }
}

const start: Conversation = [{ role: 'user', content: [{ type: 'text', text: 'Book me an e-bike.' }] }]
const clock = () => {
  let now = 0
  return { now: () => new Date((now += 10)) }
}

describe('a turn of the hosted assistant', () => {
  it('calls Hold’s tools through the MCP client until the model is done, and keeps the whole exchange', async () => {
    const model = scriptedReplies([turn([useTool('t1', 'find_shops')], 'tool_use'), turn([{ type: 'text', text: 'Ribeira Bikes has e-bikes.' }])])
    const client = toolClient()
    const result = await runHostedTurn({ model, client, conversation: start, ...clock(), today: '2026-10-30' })
    expect(result).toMatchObject({ reply: 'Ribeira Bikes has e-bikes.', stopped: 'done', toolCalls: [{ name: 'find_shops', ok: true }], simulated: true })
    expect(client.called).toEqual(['find_shops'])
    expect(result.conversation.map((message) => message.content.map((block) => block.type))).toEqual([['text'], ['tool_use'], ['tool_result'], ['text']])
    expect(model.asked[0]?.tools.map((tool) => tool.name)).toEqual(['find_shops'])
    expect(model.asked[0]?.system).toContain('2026-10-30')
  })

  it('takes the approval link from Hold’s own result, never from the model’s words', async () => {
    const model = scriptedReplies([turn([useTool('t1', 'create_booking', { quote_id: 'q' })], 'tool_use'), turn([{ type: 'text', text: 'Pay at https://evil.example/pay' }])])
    const client = toolClient({ create_booking: { structuredContent: { status: 'awaiting_payment', approval_url: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1' } } })
    const result = await runHostedTurn({ model, client, conversation: start, ...clock(), today: '2026-10-30' })
    expect(result.approvalUrl).toBe('https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1')
  })

  it('stops at the ceiling on tool calls, answering every call it started so the exchange stays whole', async () => {
    const model = scriptedReplies([turn([useTool('t1', 'find_shops'), useTool('t2', 'find_shops')], 'tool_use')])
    const client = toolClient()
    const result = await runHostedTurn({ model, client, conversation: start, ...clock(), today: '2026-10-30' })
    expect(result.stopped).toBe('ceiling')
    expect(client.called).toHaveLength(HOSTED_LIMITS.toolCalls)
    const uses = result.conversation.flatMap((message) => message.content.filter((block) => block.type === 'tool_use'))
    const answered = result.conversation.flatMap((message) => message.content.filter((block) => block.type === 'tool_result'))
    expect(answered).toHaveLength(uses.length)
  })

  it('stops at the ceiling on tokens and on time', async () => {
    const tokens = await runHostedTurn({ model: scriptedReplies([turn([useTool('t1', 'find_shops')], 'tool_use', HOSTED_LIMITS.tokens)]), client: toolClient(), conversation: start, ...clock(), today: '2026-10-30' })
    expect(tokens.stopped).toBe('ceiling')
    let now = 0
    const slow = await runHostedTurn({ model: scriptedReplies([turn([useTool('t1', 'find_shops')], 'tool_use')]), client: toolClient(), conversation: start, now: () => new Date((now += HOSTED_LIMITS.milliseconds)), today: '2026-10-30' })
    expect(slow.stopped).toBe('ceiling')
  })

  it('takes a refusal or an unreachable model as an ordinary outcome, with nothing called', async () => {
    for (const kind of ['refused', 'unavailable'] as const) {
      const client = toolClient()
      const result = await runHostedTurn({ model: scriptedReplies([{ kind, model: 'test-model' }]), client, conversation: start, ...clock(), today: '2026-10-30' })
      expect(result).toMatchObject({ stopped: kind, reply: '', toolCalls: [] })
      expect(client.called).toEqual([])
      expect(result.conversation).toEqual(start)
    }
  })

  it('reports a refused tool call as not done, and passes Hold’s refusal to the model as an error', async () => {
    const model = scriptedReplies([turn([useTool('t1', 'get_hold')], 'tool_use'), turn([{ type: 'text', text: 'That was refused.' }])])
    const result = await runHostedTurn({ model, client: toolClient({ get_hold: { isError: true } }), conversation: start, ...clock(), today: '2026-10-30' })
    expect(result.toolCalls).toEqual([{ name: 'get_hold', ok: false }])
    expect(result.conversation[2]?.content[0]).toMatchObject({ type: 'tool_result', is_error: true })
  })
})
