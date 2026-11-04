import 'server-only'
import { createBedrockAssistantModel, createScriptedModel, HOSTED_PROMPT_VERSION, runHostedTurn, SERVER_INFO } from '@hold/mcp'
import type { Conversation, HostedLookup, HostedTurn, OwnShop } from '@hold/mcp'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { qrSvg } from './qr'
import { getServices } from './services'

// The hosted assistant is a client, not a shortcut (extensions.md section 8.10): it connects to this app's own /mcp
// address as any outside MCP client does, with the same tools, gateway, limits and audit log. Its model is Claude on
// Bedrock, or in the test environment a scripted stand-in that says it is simulated.

export const HOSTED_CLIENT_NAME = 'Hold hosted assistant (demonstration)'

// no_booking, already_followed: the person asked about their latest booking and there was none the assistant could
// follow, so neither Hold's tools nor the model were asked.
export type HostedAnswer = Omit<HostedTurn, 'conversation' | 'stopped'> & { readonly conversation: Conversation; readonly approvalQr: string | null; readonly stopped: HostedTurn['stopped'] | 'no_booking' | 'already_followed' }

export function notLookedUp(conversation: Conversation, reason: 'no_booking' | 'already_followed'): HostedAnswer {
  return { conversation, reply: '', toolCalls: [], approvalUrl: null, approvalQr: null, stopped: reason, simulated: false, model: '', promptVersion: HOSTED_PROMPT_VERSION }
}

// The person's words as the next message. A turn the model never answered can end on Hold's own tool result, kept so a
// booking it looked up is not lost; the words then join that message, as the model's API expects.
function withQuestion(conversation: Conversation, text: string): Conversation {
  const last = conversation.at(-1)
  const question = { type: 'text' as const, text }
  return last?.role === 'user' ? [...conversation.slice(0, -1), { role: 'user', content: [...last.content, question] }] : [...conversation, { role: 'user', content: [question] }]
}

// ownShop: the demo shop this browser started, which the assistant rents from unless the person names another.
// lookup: the person's own latest booking, read through Hold's tools before the model answers.
export async function askHostedAssistant(conversation: Conversation, text: string, ownShop?: OwnShop, lookup?: HostedLookup): Promise<HostedAnswer> {
  const { config } = await getServices()
  const model = config.services === 'fake' ? createScriptedModel(() => new Date()) : createBedrockAssistantModel({ awsRegion: config.region })
  const asked = withQuestion(conversation, text)
  const client = new Client({ name: HOSTED_CLIENT_NAME, version: SERVER_INFO.version })
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', config.publicUrl)))
  } catch {
    // Hold's own server could not be reached: nothing was asked and nothing booked.
    return { conversation, reply: '', toolCalls: [], approvalUrl: null, approvalQr: null, stopped: 'unavailable', simulated: model.simulated, model: '', promptVersion: HOSTED_PROMPT_VERSION }
  }
  try {
    const turn = await runHostedTurn({ model, client, conversation: asked, now: () => new Date(), today: new Date().toISOString().slice(0, 10), ...(ownShop === undefined ? {} : { ownShop }), ...(lookup === undefined ? {} : { lookup }) })
    // A turn the model declined or never reached is not kept, so the next one starts from a whole exchange; but one
    // that looked up a booking is, since that booking's secret is given only once.
    const kept = (turn.stopped === 'refused' || turn.stopped === 'unavailable') && lookup === undefined ? conversation : turn.conversation
    return { ...turn, conversation: kept, approvalQr: turn.approvalUrl === null ? null : await qrSvg(turn.approvalUrl) }
  } finally {
    await client.close()
  }
}
