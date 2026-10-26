import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { openPayPalReader } from './paypal-reader.ts'

// A stand-in for PayPal's MCP server: its read tools under the names it really lists, and write tools beside them.
async function paypalServer(names: readonly string[]) {
  const called: string[] = []
  const server = new McpServer({ name: 'paypal-standin', version: '0.0.0' })
  for (const name of names) {
    server.registerTool(name, { description: `PayPal ${name}`, inputSchema: { id: z.string().optional() } }, (args) => {
      called.push(name)
      return { content: [{ type: 'text', text: `${name} ${JSON.stringify(args)}` }] }
    })
  }
  const [client, serverSide] = InMemoryTransport.createLinkedPair()
  await server.connect(serverSide)
  return { transport: client, called }
}

const READS = ['list_transactions', 'get_order', 'get_refund', 'list_disputes', 'get_dispute', 'list_invoices', 'get_invoice']
const WRITES = ['create_refund', 'accept_dispute_claim', 'create_invoice', 'send_invoice_reminder']

describe('the PayPal MCP reader', () => {
  it('offers only the read tools on Hold\'s allowlist, under the names the server lists', async () => {
    const { transport } = await paypalServer([...READS, ...WRITES])
    const opened = await openPayPalReader(transport)
    if (!opened.ok) throw new Error(opened.reason)
    expect(opened.reader.tools.map((tool) => tool.name).sort()).toEqual([...READS].sort())
    await opened.reader.close()
  })

  it('accepts the other spelling PayPal\'s documents use for a tool', async () => {
    const { transport } = await paypalServer([...READS.filter((name) => name !== 'list_transactions'), 'list_transaction'])
    const opened = await openPayPalReader(transport)
    expect(opened.ok && opened.reader.tools.some((tool) => tool.name === 'list_transaction')).toBe(true)
  })

  it('refuses a write tool without reaching the server, and reads through an allowed one', async () => {
    const { transport, called } = await paypalServer([...READS, ...WRITES])
    const opened = await openPayPalReader(transport)
    if (!opened.ok) throw new Error(opened.reason)
    expect(await opened.reader.call('create_refund', { id: 'CAPTURE-1' })).toEqual({ ok: false, reason: 'not_allowed' })
    expect(await opened.reader.call('get_order', { id: 'ORDER-1' })).toEqual({ ok: true, text: 'get_order {"id":"ORDER-1"}' })
    expect(called).toEqual(['get_order'])
  })

  it('will not start when a tool the run needs is missing', async () => {
    const { transport } = await paypalServer(READS.filter((name) => name !== 'get_dispute'))
    expect(await openPayPalReader(transport)).toEqual({ ok: false, reason: 'missing_tools', missing: ['get_dispute'] })
  })
})
