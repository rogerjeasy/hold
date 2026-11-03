import type { PayPalReader } from './paypal-reader.ts'

// What PayPal's read tools answer for a demo's sample (extensions.md section 6.14). A sample's PayPal references were
// made up for the demonstration and were never on PayPal, so each read answers with the sample's own records, said to
// be simulated in every answer. The same read tools are offered as PayPal's server lists, and the gateway sees each call.
const SAMPLE_TOOLS = ['list_transactions', 'get_order', 'list_disputes', 'get_dispute', 'get_invoice'] as const
const NOTE = 'Simulated for a demonstration sample: PayPal has no record of it. These are the sample\'s own records, as PayPal would show them.'

export function samplePayPalReader(facts: unknown): PayPalReader {
  const text = JSON.stringify({ simulated: true, note: NOTE, records: facts })
  return {
    tools: SAMPLE_TOOLS.map((name) => ({ name, description: `${name}, simulated for a sample. ${NOTE}`, inputSchema: { type: 'object' } })),
    call: (name) => Promise.resolve(SAMPLE_TOOLS.some((tool) => tool === name) ? { ok: true, text } : { ok: false, reason: 'not_allowed' }),
    close: () => Promise.resolve(),
  }
}
