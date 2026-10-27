import { randomUUID } from 'node:crypto'
import { ASSISTANT_LIMITS } from '@hold/domain'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { TOOL_NAMES, TOOLS } from './catalogue.ts'
import { callTool } from './dispatch.ts'
import type { McpPorts } from './ports.ts'
import type { Caller } from './public-tools.ts'

// Hold's MCP server, served over streamable HTTP with no sign-in step (extensions.md section 8). Each request gets a
// fresh server: nothing is kept between requests, so any instance of the app can answer any call. Rental tools carry
// their agent token as an argument, so any MCP client can use them without special setup.

export const SERVER_INFO = { name: 'hold', title: 'Hold: rent from small shops through your assistant', version: '1.0.0' } as const

// An MCP request is a small JSON document. The app refuses anything larger before it reaches this server.
export const MAX_MCP_REQUEST_BYTES = 64 * 1024

const jsonSchema = (schema: z.ZodType, io: 'input' | 'output') => {
  const document = z.toJSONSchema(schema, { io }) as { type: 'object'; [key: string]: unknown }
  delete document['$schema']
  return document
}

// The tools are listed and called through the protocol's own handlers rather than McpServer's registry, so that every
// call, including one whose arguments are wrong, reaches the gateway and its audit line.
export function holdServer(caller: Caller): McpServer {
  const mcp = new McpServer(SERVER_INFO, { capabilities: { tools: {} } })
  const { server } = mcp
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOL_NAMES.map((name) => ({
      name,
      description: TOOLS[name].description,
      inputSchema: jsonSchema(TOOLS[name].input, 'input'),
      outputSchema: jsonSchema(TOOLS[name].output, 'output'),
      annotations: { readOnlyHint: TOOLS[name].tier === 'read', destructiveHint: false, openWorldHint: false },
    })),
  }))
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const result = await callTool(caller, request.params.name, request.params.arguments)
    if (!result.ok) return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: result.error }) }] }
    return {
      content: [{ type: 'text', text: JSON.stringify(result.output) }, ...(result.image === undefined ? [] : [{ type: 'image' as const, data: result.image, mimeType: 'image/png' }])],
      structuredContent: result.output,
    }
  })
  return mcp
}

// The name a client declares when it connects travels in the session ID the server hands back, so it reaches every
// later request without the server keeping anything. It is the client's own word, shown to the renter as not verified.
export function sessionIdFor(clientName: string): string {
  return `h1.${Buffer.from(clientName.slice(0, ASSISTANT_LIMITS.clientNameLength)).toString('base64url')}.${randomUUID()}`
}

export function clientNameOf(sessionId: string | null): string {
  const encoded = sessionId?.split('.')[1]
  if (sessionId?.startsWith('h1.') !== true || encoded === undefined) return ''
  // Only printable characters, as a short line of text.
  return Buffer.from(encoded, 'base64url').toString('utf8').replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, ASSISTANT_LIMITS.clientNameLength)
}

const jsonError = (status: number, message: string) => new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }), { status, headers: { 'content-type': 'application/json' } })

const initializeSchema = z.object({ method: z.literal('initialize'), params: z.object({ clientInfo: z.object({ name: z.string() }) }) })

// One HTTP request to /mcp, its body already read. Only POST carries calls: this server offers no stream of its own
// messages and keeps no session to end, so GET and DELETE are answered 405, as the transport's specification allows.
export async function handleMcpRequest(request: Request, body: string, ports: McpPorts, network: string | undefined): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return jsonError(400, 'The request is not JSON.')
  }
  const initialize = initializeSchema.safeParse(parsed)
  const clientLabel = initialize.success ? initialize.data.params.clientInfo.name.slice(0, ASSISTANT_LIMITS.clientNameLength) : clientNameOf(request.headers.get('mcp-session-id'))
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  const server = holdServer({ ports, network, clientLabel })
  await server.connect(transport)
  try {
    const response = await transport.handleRequest(request, { parsedBody: parsed })
    if (!initialize.success || !response.ok) return response
    const headers = new Headers(response.headers)
    headers.set('mcp-session-id', sessionIdFor(clientLabel))
    return new Response(response.body, { status: response.status, headers })
  } finally {
    await server.close()
  }
}
