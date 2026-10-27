import 'server-only'
import { createBedrockAssistantModel, createScriptedModel, HOSTED_PROMPT_VERSION, runHostedTurn, SERVER_INFO } from '@hold/mcp'
import type { Conversation, HostedTurn } from '@hold/mcp'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { qrSvg } from './qr'
import { getServices } from './services'

// The hosted assistant is a client, not a shortcut (extensions.md section 8.10): it connects to this app's own /mcp
// address as any outside MCP client does, with the same tools, gateway, limits and audit log. Its model is Claude on
// Bedrock, or in the test environment a scripted stand-in that says it is simulated.

export const HOSTED_CLIENT_NAME = 'Hold hosted assistant (demonstration)'

export type HostedAnswer = Omit<HostedTurn, 'conversation'> & { readonly conversation: Conversation; readonly approvalQr: string | null }

export async function askHostedAssistant(conversation: Conversation, text: string): Promise<HostedAnswer> {
  const { config } = await getServices()
  const model = config.services === 'fake' ? createScriptedModel(() => new Date()) : createBedrockAssistantModel({ awsRegion: config.region })
  const asked: Conversation = [...conversation, { role: 'user', content: [{ type: 'text', text }] }]
  const client = new Client({ name: HOSTED_CLIENT_NAME, version: SERVER_INFO.version })
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', config.publicUrl)))
  } catch {
    // Hold's own server could not be reached: nothing was asked and nothing booked.
    return { conversation, reply: '', toolCalls: [], approvalUrl: null, approvalQr: null, stopped: 'unavailable', simulated: model.simulated, model: '', promptVersion: HOSTED_PROMPT_VERSION }
  }
  try {
    const turn = await runHostedTurn({ model, client, conversation: asked, now: () => new Date(), today: new Date().toISOString().slice(0, 10) })
    // A turn the model declined or never reached is not kept, so the next one starts from a whole exchange.
    const kept = turn.stopped === 'refused' || turn.stopped === 'unavailable' ? conversation : turn.conversation
    return { ...turn, conversation: kept, approvalQr: turn.approvalUrl === null ? null : await qrSvg(turn.approvalUrl) }
  } finally {
    await client.close()
  }
}
