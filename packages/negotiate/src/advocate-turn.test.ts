import { describe, expect, it } from 'vitest'
import type { AdvocateModel, AdvocateReply, AdvocateRequest, ToolCall, ToolResult } from './advocate-model.ts'
import { advocateConversation, MOVE_LIMITS } from './advocate-turn.ts'
import type { MoveLimits } from './advocate-turn.ts'

// One advocate's move as a bounded tool loop: read-only evidence first, then exactly one move.

const usage = { model: 'fake-model', inputTokens: 100, outputTokens: 20 }
const calls = (...list: readonly ToolCall[]): AdvocateReply => ({ kind: 'calls', calls: list, raw: null, ...usage })
const call = (name: string, input: unknown = {}, id = `call-${name}`): ToolCall => ({ id, name, input })

// A model that plays the given replies in turn, recording every request it is sent.
function scripted(replies: readonly AdvocateReply[], seen: AdvocateRequest[] = []): AdvocateModel {
  let index = 0
  return { next: (request) => { seen.push(structuredClone(request)); const reply = replies[Math.min(index, replies.length - 1)]; index += 1; return reply === undefined ? Promise.reject(new Error('No reply')) : Promise.resolve(reply) } }
}
const reads: string[] = []
const readTool = (toolCall: ToolCall): Promise<ToolResult> => { reads.push(toolCall.name); return Promise.resolve({ callId: toolCall.id, parts: [{ type: 'text', text: `<data>${toolCall.name}</data>` }], isError: false }) }

function conversation(model: AdvocateModel, options: { readonly limits?: Partial<MoveLimits>; readonly now?: () => Date } = {}) {
  return advocateConversation({ model, side: 'renter', system: 'You are the renter’s advocate.', opening: 'It is your move.', readTool, limits: { ...MOVE_LIMITS, ...options.limits }, now: options.now ?? (() => new Date('2026-11-01T10:00:00Z')), perCallMilliseconds: 1000 })
}

describe('an advocate’s move', () => {
  it('reads the evidence it asks for, then makes exactly one move, and the model sees each tool’s result', async () => {
    reads.length = 0
    const seen: AdvocateRequest[] = []
    const model = scripted([calls(call('get_negotiation'), call('get_claim_lines')), calls(call('get_line_photos', { lineId: 'line-1' })), calls(call('offer', { lines: [] }))], seen)
    const talk = conversation(model)
    expect(await talk.nextMove(null)).toEqual({ kind: 'move', tool: 'offer', input: { lines: [] }, model: 'fake-model' })
    expect(reads).toEqual(['get_negotiation', 'get_claim_lines', 'get_line_photos'])
    expect(seen).toHaveLength(3)
    expect(seen[0]?.messages).toEqual([{ role: 'user', text: 'It is your move.' }])
    expect(seen[2]?.messages.at(-1)).toEqual({ role: 'tool_results', results: [{ callId: 'call-get_line_photos', parts: [{ type: 'text', text: '<data>get_line_photos</data>' }], isError: false }] })
    expect(talk.usage).toEqual({ modelCalls: 3, toolCalls: 3, tokens: 360 })
  })

  it('answers an unknown tool with an error, and never runs one', async () => {
    reads.length = 0
    const seen: AdvocateRequest[] = []
    const talk = conversation(scripted([calls(call('capture_hold', { cents: 100 })), calls(call('pass'))], seen))
    expect(await talk.nextMove(null)).toMatchObject({ kind: 'move', tool: 'pass' })
    expect(reads).toEqual([])
    expect(seen[1]?.messages.at(-1)).toEqual({ role: 'tool_results', results: [{ callId: 'call-capture_hold', parts: [{ type: 'text', text: 'unknown_tool' }], isError: true }] })
  })

  it('gives a move the referee refused one more try, telling the model why, in the same conversation', async () => {
    const seen: AdvocateRequest[] = []
    const talk = conversation(scripted([calls(call('get_negotiation'), call('accept', {}, 'move-1')), calls(call('pass', {}, 'move-2'))], seen))
    expect(await talk.nextMove(null)).toMatchObject({ kind: 'move', tool: 'accept' })
    expect(await talk.nextMove('nothing_to_accept')).toMatchObject({ kind: 'move', tool: 'pass' })
    // Every call of the turn has its result: the read was not run once a move was made, and the move was refused.
    expect(seen[1]?.messages.at(-1)).toEqual({ role: 'tool_results', results: [
      { callId: 'call-get_negotiation', parts: [{ type: 'text', text: 'Not run: a move ends the reading.' }], isError: true },
      { callId: 'move-1', parts: [{ type: 'text', text: 'The referee refused this move. Its reason: nothing_to_accept. Make one move again.' }], isError: true },
    ] })
  })

  it('passes, as unavailable, when the model refuses, cannot be reached, answers without a tool, throws, or makes two moves at once', async () => {
    for (const kind of ['refused', 'unavailable', 'no_move'] as const) expect(await conversation(scripted([{ kind, ...usage }])).nextMove(null)).toEqual({ kind: 'pass', reason: 'unavailable', model: 'fake-model' })
    expect(await conversation({ next: () => Promise.reject(new Error('socket hang up')) }).nextMove(null)).toEqual({ kind: 'pass', reason: 'unavailable', model: 'not_answered' })
    expect(await conversation(scripted([calls(call('accept', {}, 'one'), call('pass', {}, 'two'))])).nextMove(null)).toEqual({ kind: 'pass', reason: 'unavailable', model: 'fake-model' })
  })

  it('passes at a ceiling on model calls, tokens or time, so a model that only reads never stalls the claim', async () => {
    const reader = scripted([calls(call('get_negotiation'))])
    expect(await conversation(reader, { limits: { maxModelCalls: 3 } }).nextMove(null)).toEqual({ kind: 'pass', reason: 'ceiling', model: 'fake-model' })
    expect(await conversation(scripted([{ kind: 'calls', calls: [call('get_negotiation')], raw: null, model: 'fake-model', inputTokens: 90_000, outputTokens: 1 }]), { limits: { maxTokens: 100_000 } }).nextMove(null)).toEqual({ kind: 'pass', reason: 'ceiling', model: 'fake-model' })
    let minutes = 0
    const clock = () => new Date(Date.UTC(2026, 10, 1, 10, (minutes += 2)))
    expect(await conversation(reader, { now: clock, limits: { maxMilliseconds: 5 * 60_000 } }).nextMove(null)).toMatchObject({ kind: 'pass', reason: 'ceiling' })
  })

  it('stops running reads past its ceiling on tool calls, and asks for the move instead', async () => {
    reads.length = 0
    const seen: AdvocateRequest[] = []
    const talk = conversation(scripted([calls(call('get_negotiation', {}, 'a'), call('get_price_list', {}, 'b'), call('get_known_marks', {}, 'c')), calls(call('pass'))], seen), { limits: { maxToolCalls: 2 } })
    expect(await talk.nextMove(null)).toMatchObject({ kind: 'move', tool: 'pass' })
    expect(reads).toEqual(['get_negotiation', 'get_price_list'])
    const last = seen[1]?.messages.at(-1)
    expect(last?.role === 'tool_results' ? last.results[2] : undefined).toEqual({ callId: 'c', parts: [{ type: 'text', text: 'Not run: no more reads for this move. Make your move now.' }], isError: true })
  })
})
