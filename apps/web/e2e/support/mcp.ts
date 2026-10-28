import type { APIRequestContext } from '@playwright/test'
import { expect } from './test'

// An outside MCP client of the app's /mcp, as a renter's own assistant would be: plain JSON-RPC over streamable HTTP,
// with the session ID the server hands back on initialize.

export type McpResult = { readonly isError: boolean; readonly data: Readonly<Record<string, unknown>> }

export async function mcpClient(request: APIRequestContext, name: string) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  let id = 0
  const initialized = await request.post('/mcp', { headers, data: { jsonrpc: '2.0', id: (id += 1), method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name, version: '1.0.0' } } } })
  expect(initialized.ok()).toBe(true)
  const session = { ...headers, 'mcp-session-id': initialized.headers()['mcp-session-id'] ?? '', 'mcp-protocol-version': '2025-06-18' }
  await request.post('/mcp', { headers: session, data: { jsonrpc: '2.0', method: 'notifications/initialized' } })
  return {
    async call(tool: string, args: Readonly<Record<string, unknown>>): Promise<McpResult> {
      const response = await request.post('/mcp', { headers: session, data: { jsonrpc: '2.0', id: (id += 1), method: 'tools/call', params: { name: tool, arguments: args } } })
      const body = (await response.json()) as { readonly result?: { readonly isError?: boolean; readonly structuredContent?: Readonly<Record<string, unknown>>; readonly content?: readonly { readonly text?: string }[] } }
      const result = body.result ?? {}
      return { isError: result.isError === true, data: result.structuredContent ?? (JSON.parse(result.content?.[0]?.text ?? '{}') as Readonly<Record<string, unknown>>) }
    },
  }
}
