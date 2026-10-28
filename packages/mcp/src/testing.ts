import { randomBytes } from 'node:crypto'
import { addDays } from '@hold/domain'
import { inShop, saveFeeOrder } from '@hold/db'
import type { Database } from '@hold/db'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpPorts, NegotiationHandOff } from './ports.ts'
import { handleMcpRequest } from './server.ts'

// For the package's tests: ports over a real database whose PayPal only makes approval links, and an MCP SDK client
// that reaches the server over streamable HTTP without a network.

export const TEST_SECRET = Buffer.alloc(32, 3)

export function testPorts(database: Database, logged: Readonly<Record<string, unknown>>[] = [], handedOff: NegotiationHandOff[] = []): McpPorts {
  let orders = 0
  return {
    database,
    now: () => new Date(),
    paypalMode: 'sandbox',
    secret: TEST_SECRET,
    random: () => randomBytes(32),
    publicUrl: 'https://hold.example',
    newRenterLink: (endsAt) => Promise.resolve({ token: `link-${String(Math.random())}`, fingerprint: `link-${String(Math.random())}`, expiresAt: addDays(endsAt, 60) }),
    async startFeePayment(booking) {
      orders += 1
      const orderId = `ORDER-${booking.rentalId.slice(0, 8)}-${String(orders)}`
      await inShop(database, { role: 'hold_app', shopId: booking.shopId }, (transaction) => saveFeeOrder(transaction, booking.rentalId, orderId))
      return { ok: true, approvalUrl: `https://paypal.example/checkoutnow?token=${orderId}` }
    },
    holdApproval: () => Promise.resolve({ status: 'not_requested' }),
    photoLink: (key) => Promise.resolve(`https://photos.example/${key}`),
    sendNegotiation: (handOff) => { handedOff.push(handOff); return Promise.resolve() },
    qrCode: () => Promise.resolve('iVBORw0KGgo='),
    log: (line) => void logged.push(line),
  }
}

export async function connectClient(ports: McpPorts, network: string, name: string): Promise<Client> {
  const client = new Client({ name, version: '1.0.0' })
  const fetch = async (url: string | URL, init?: RequestInit) => {
    const request = new Request(url, init)
    return handleMcpRequest(request, request.method === 'POST' ? await request.text() : '', ports, network)
  }
  await client.connect(new StreamableHTTPClientTransport(new URL('https://hold.example/mcp'), { fetch }))
  await client.listTools()
  return client
}
