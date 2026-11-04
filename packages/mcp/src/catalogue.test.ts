import { AGENT_SCOPES, TOOL_TIERS } from '@hold/domain'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { NEGOTIATION_SCOPE, NOT_OFFERED, TOOL_NAMES, TOOLS } from './catalogue.ts'

type JsonSchema = { readonly type?: string; readonly properties?: Readonly<Record<string, JsonSchema>>; readonly items?: JsonSchema; readonly additionalProperties?: unknown; readonly anyOf?: readonly JsonSchema[] }

// Every property in a schema, with its path and its own schema, however deep.
function properties(schema: JsonSchema, path = ''): { readonly path: string; readonly name: string; readonly schema: JsonSchema }[] {
  const own = Object.entries(schema.properties ?? {}).flatMap(([name, child]) => [{ path: `${path}.${name}`, name, schema: child }, ...properties(child, `${path}.${name}`)])
  const items = schema.items === undefined ? [] : properties(schema.items, `${path}[]`)
  const options = (schema.anyOf ?? []).flatMap((option) => properties(option, path))
  return [...own, ...items, ...options]
}

const json = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'input' }) as JsonSchema

describe('the tools section 8.3 lists', () => {
  it('are offered, apart from those this server leaves out and says why', () => {
    expect(TOOL_NAMES.sort()).toEqual(
      ['find_shops', 'get_shop', 'check_availability', 'get_damage_prices', 'quote_rental', 'create_booking', 'get_booking', 'get_rental', 'get_hold', 'get_hold_approval_link', 'request_extension', 'get_condition_report', 'get_claim', 'draft_claim_reply', 'submit_claim_reply', 'get_record', 'get_negotiation', 'get_claim_lines', 'get_line_photos', 'get_price_list', 'get_known_marks', 'submit_offer'].sort(),
    )
    expect(Object.keys(NOT_OFFERED).sort()).toEqual(['report_incident'])
  })

  it('gives the advocate’s tools a scope no agent token is issued with: the renter grants it for one claim', () => {
    const advocate = TOOL_NAMES.filter((name) => TOOLS[name].scope === NEGOTIATION_SCOPE)
    expect(advocate.sort()).toEqual(['get_claim_lines', 'get_known_marks', 'get_line_photos', 'get_negotiation', 'get_price_list', 'submit_offer'])
    expect(AGENT_SCOPES as readonly string[]).not.toContain(NEGOTIATION_SCOPE)
  })
})

describe('each tool’s contract', () => {
  it.each(TOOL_NAMES)('%s takes and returns one object, refusing fields it does not name', (name) => {
    for (const schema of [json(TOOLS[name].input), json(TOOLS[name].output)]) {
      expect(schema.type).toBe('object')
      expect(schema.additionalProperties).toBe(false)
      for (const property of properties(schema)) if (property.schema.type === 'object') expect(property.schema.additionalProperties, property.path).toBe(false)
    }
  })

  it.each(TOOL_NAMES)('%s has a tier from the gateway’s list and names a scope exactly when it needs a token', (name) => {
    const definition = TOOLS[name]
    expect(TOOL_TIERS).toContain(definition.tier)
    expect(definition.scope === null).toBe(definition.audience === 'public')
    const takesToken = 'agent_token' in definition.input.shape
    expect(takesToken).toBe(definition.audience === 'rental')
  })

  // Listed in full, so a tier is never changed without this test. A tool that writes something a person must approve
  // before anything happens, such as request_extension's PayPal order for more days, proposes; it does not draft.
  it('gives every tool the tier that says what it does', () => {
    expect(Object.fromEntries(TOOL_NAMES.map((name) => [name, TOOLS[name].tier]))).toEqual({
      find_shops: 'read', get_shop: 'read', check_availability: 'read', get_damage_prices: 'read', quote_rental: 'draft', create_booking: 'draft', get_booking: 'read',
      get_rental: 'read', get_hold: 'read', get_hold_approval_link: 'read', request_extension: 'propose', get_condition_report: 'read', get_claim: 'read', draft_claim_reply: 'draft', submit_claim_reply: 'act_under_mandate', get_record: 'read',
      get_negotiation: 'read', get_claim_lines: 'read', get_line_photos: 'read', get_price_list: 'read', get_known_marks: 'read', submit_offer: 'act_under_mandate',
    })
  })

  it('rejects an argument the tool does not name', () => {
    expect(TOOLS.quote_rental.input.safeParse({ shop: 'ribeira-bikes', starts_at: '2026-11-01T10:00', ends_at: '2026-11-04T10:00', items: [{ item_type_id: '0b6d4c2e-0000-4000-8000-000000000001', count: 1 }], fee: { cents: 1, currency: 'EUR' } }).success).toBe(false)
  })
})

describe('money', () => {
  // The one amount any tool takes: the advocate's offer lines (AGENTS.md section 6), which the referee holds to each
  // line's published price, the claim the shop approved and the renter's own limit.
  const OFFER_CENTS = 'submit_offer:.lines[].cents'
  it.each(TOOL_NAMES)('%s accepts no amount, price, fee or hold, and no number but a count, except an offer line', (name) => {
    for (const property of properties(json(TOOLS[name].input))) {
      if (`${name}:${property.path}` === OFFER_CENTS) continue
      expect(property.name, property.path).not.toMatch(/amount|cents|price|fee|hold|total|money|cost|rate/i)
      if (property.schema.type === 'number' || property.schema.type === 'integer') expect(property.name, property.path).toBe('count')
    }
  })

  it('takes an offer line’s cents as a whole number of zero or more, and nothing else that names money', () => {
    const offer = properties(json(TOOLS.submit_offer.input)).find((property) => property.path === '.lines[].cents')
    expect(offer?.schema).toMatchObject({ type: 'integer', minimum: 0 })
    expect(TOOLS.submit_offer.input.safeParse({ rental_id: '0b6d4c2e-0000-4000-8000-000000000001', agent_token: 'hat_x', move: 'offer', lines: [{ line_id: 'l', cents: 1.5, ground: null, evidence: [] }] }).success).toBe(false)
    expect(TOOLS.submit_offer.input.safeParse({ rental_id: '0b6d4c2e-0000-4000-8000-000000000001', agent_token: 'hat_x', move: 'accept', total: { cents: 1, currency: 'EUR' } }).success).toBe(false)
  })

  it('has no tool that captures a hold: none sits above the tiers the gateway knows, and only the claim reply and the advocate’s move act under a mandate', () => {
    const acting = TOOL_NAMES.filter((name) => TOOLS[name].tier === 'act_under_mandate')
    expect(acting).toEqual(['submit_claim_reply', 'submit_offer'])
    // Listed by name so a new tool that sounds like money is a deliberate change to this test.
    expect(TOOL_NAMES.filter((name) => /capture|charge|pay_|refund|release|authori[sz]e/.test(name))).toEqual([])
  })
})
