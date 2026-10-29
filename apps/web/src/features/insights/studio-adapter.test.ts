import type { InsightsResponse } from '@hold/agent'
import { describe, expect, it, vi } from 'vitest'
import { studioAdapter } from './studio-adapter'

// The insights dashboard's model adapter (extensions.md section 12.5): AG Studio's loop asks it for one turn; it asks
// Hold's server function, then plays the answer to Studio as the events its chat panel draws, and resolves the turn.

const request = { input: [{ id: 'm1', kind: 'input', type: 'message', role: 'user', status: 'completed', content: [{ type: 'text', text: 'Hi' }] }], instructions: 'Arrange.', tools: [{ name: 'add_widget', description: 'Add.', parameters: { type: 'object' } }], toolChoice: 'auto', responseFormat: { type: 'text' } } as const
const answer: InsightsResponse = {
  id: 'msg_1', createdAt: 0, status: 'completed', model: 'claude-opus-4-6', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  output: [
    { id: 'msg_1-0', kind: 'output', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'text', text: 'Adding it.', annotations: [] }] },
    { id: 'toolu_1', kind: 'output', type: 'function_call', callId: 'toolu_1', name: 'add_widget', arguments: '{"type":"grid"}', status: 'completed' },
  ],
}

async function drain(stream: AsyncIterable<unknown>) {
  const events: unknown[] = []
  for await (const event of stream) events.push(event)
  return events
}

describe('the insights dashboard’s model adapter', () => {
  it('sends the turn as AG Studio gave it, plays the text and each call as events, and resolves with the answer', async () => {
    const ask = vi.fn((...call: [unknown, FormData]) => Promise.resolve({ ok: true as const, value: { response: answer }, call }))
    const turn = studioAdapter(ask).executeTurn(request as never)
    expect(await drain(turn.stream)).toEqual([
      { type: 'TEXT_MESSAGE_START', messageId: 'msg_1-0', role: 'assistant' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg_1-0', delta: 'Adding it.' },
      { type: 'TEXT_MESSAGE_END', messageId: 'msg_1-0' },
      { type: 'TOOL_CALL_START', toolCallId: 'toolu_1', toolCallName: 'add_widget' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'toolu_1', delta: '{"type":"grid"}' },
      { type: 'TOOL_CALL_END', toolCallId: 'toolu_1' },
    ])
    expect(await turn.complete).toEqual(answer)
    const sent = ask.mock.calls[0]?.[1].get('turn')
    expect(typeof sent === 'string' ? JSON.parse(sent) : sent).toEqual({ input: request.input, instructions: 'Arrange.', tools: request.tools, toolChoice: 'auto' })
  })

  it('fails the turn when the server refuses it, so AG Studio says so in its panel', async () => {
    const turn = studioAdapter(() => Promise.resolve({ ok: false as const, failure: 'rate_limited' })).executeTurn(request as never)
    expect(await drain(turn.stream)).toEqual([])
    await expect(turn.complete).rejects.toThrow('rate_limited')
  })
})
