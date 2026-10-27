import { handleMcpRequest, MAX_MCP_REQUEST_BYTES } from '@hold/mcp'
import { readCappedBody } from '@/server/capped-body'
import { mcpPorts } from '@/server/mcp-ports'
import { callerNetwork } from '@/server/network'

// Hold's MCP server for renters' assistants, over streamable HTTP with no sign-in step (architecture.md section 13.4).
// Outside the language proxy. Every call passes the gateway in packages/mcp, which rate limits by network or token.

export const dynamic = 'force-dynamic'

async function serve(request: Request): Promise<Response> {
  const body = request.method === 'POST' ? await readCappedBody(request, MAX_MCP_REQUEST_BYTES) : { ok: true as const, text: '' }
  if (!body.ok) return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'The request is too large.' }, id: null }), { status: 413, headers: { 'content-type': 'application/json' } })
  return handleMcpRequest(request, body.text, await mcpPorts(), await callerNetwork())
}

export const POST = serve
export const GET = serve
export const DELETE = serve
