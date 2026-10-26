import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

// PayPal's remote MCP server, reached over server-sent events with the shop's own token (tech-stack.md trial 10).
export const PAYPAL_MCP_SANDBOX_URL = 'https://mcp.sandbox.paypal.com/sse'

// The read tools Hold offers the model, each with every spelling PayPal's documents give it (extensions.md section
// 6.6). A tool the server lists that is not here, such as create_refund, is never offered and never called.
const READ_TOOLS: Readonly<Record<string, readonly string[]>> = {
  list_transactions: ['list_transactions', 'list_transaction'],
  get_order: ['get_order'],
  get_refund: ['get_refund'],
  get_merchant_insights: ['get_merchant_insights'],
  list_disputes: ['list_disputes'],
  get_dispute: ['get_dispute'],
  list_invoices: ['list_invoices'],
  get_invoice: ['get_invoice'],
  get_shipment_tracking: ['get_shipment_tracking'],
}
const REQUIRED = ['list_transactions', 'get_order', 'list_disputes', 'get_dispute', 'get_invoice']

// What one tool returns is read by the model; a ceiling keeps one answer from filling a run's token budget.
const MAX_TEXT = 8000

export type PayPalTool = { readonly name: string; readonly description: string; readonly inputSchema: Readonly<Record<string, unknown>> }
export type PayPalRead = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: 'not_allowed' | 'failed' }
export type PayPalReader = {
  readonly tools: readonly PayPalTool[]
  call(name: string, args: Readonly<Record<string, unknown>>): Promise<PayPalRead>
  close(): Promise<void>
}
export type OpenedReader = { readonly ok: true; readonly reader: PayPalReader } | { readonly ok: false; readonly reason: 'unreachable' } | { readonly ok: false; readonly reason: 'missing_tools'; readonly missing: readonly string[] }

export function paypalTransport(accessToken: string, url: string = PAYPAL_MCP_SANDBOX_URL): Transport {
  const headers = { Authorization: `Bearer ${accessToken}` }
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- PayPal's MCP server answers only over SSE; its /http path returns 404 (tech-stack.md trial 10).
  return new SSEClientTransport(new URL(url), { requestInit: { headers }, eventSourceInit: { fetch: (target, init) => fetch(target, { ...init, headers: { ...init.headers, ...headers } }) } })
}

export async function openPayPalReader(transport: Transport): Promise<OpenedReader> {
  const client = new Client({ name: 'hold-operations', version: '1.0.0' })
  let listed
  try {
    await client.connect(transport)
    listed = (await client.listTools()).tools
  } catch {
    await client.close().catch(() => undefined)
    return { ok: false, reason: 'unreachable' }
  }
  const allowed = new Set(Object.values(READ_TOOLS).flat())
  const tools = listed.filter((tool) => allowed.has(tool.name)).map((tool) => ({ name: tool.name, description: tool.description ?? '', inputSchema: tool.inputSchema }))
  const missing = REQUIRED.filter((canonical) => !tools.some((tool) => READ_TOOLS[canonical]?.includes(tool.name)))
  if (missing.length > 0) {
    await client.close()
    return { ok: false, reason: 'missing_tools', missing }
  }
  const offered = new Set(tools.map((tool) => tool.name))
  return {
    ok: true,
    reader: {
      tools,
      async call(name, args) {
        if (!offered.has(name)) return { ok: false, reason: 'not_allowed' }
        try {
          const result = await client.callTool({ name, arguments: { ...args } })
          const content = Array.isArray(result.content) ? result.content : []
          const text = content.map((block: unknown) => typeof block === 'object' && block !== null && 'text' in block && typeof block.text === 'string' ? block.text : '').join('\n')
          return result.isError === true ? { ok: false, reason: 'failed' } : { ok: true, text: text.slice(0, MAX_TEXT) }
        } catch {
          return { ok: false, reason: 'failed' }
        }
      },
      close: () => client.close(),
    },
  }
}
