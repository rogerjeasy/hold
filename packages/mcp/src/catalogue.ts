import { AGENT_SCOPES, CONDITION_REPLIES, HOLD_STATES, ITEM_CATEGORIES, PRICE_CATEGORIES, RENTAL_STATES } from '@hold/domain'
import type { AgentScope, ToolTier } from '@hold/domain'
import { z } from 'zod'

// Hold's MCP tools for a renter's own assistant (extensions.md section 8.3): their names, tiers, who may call them and
// the exact shape of what goes in and comes out. This file is the contract an outside client relies on.
//
// No tool takes an amount: a quote is priced by Hold and named by its ID. Text the shop wrote comes back inside
// `{ merchant_words }`, as the merchant's words and nothing else. Hold's own fields state facts and give no instructions.

// The languages Hold's renter pages are served in; a test in apps/web keeps this equal to its routing.
export const LANGUAGES = ['en', 'es', 'fr', 'de'] as const

const amount = z.strictObject({ cents: z.number().int().min(0), currency: z.string().length(3) })
const merchantWords = z.strictObject({ merchant_words: z.string() })
const instant = z.string().describe('An ISO 8601 time in UTC.')
const shopTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .describe('A local date and time on the shop’s own clock, as YYYY-MM-DDTHH:mm.')
const shop = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/)
  .describe('The shop’s address name, as find_shops returns it.')
const rental = {
  rental_id: z.uuid().describe('The rental get_booking named.'),
  agent_token: z.string().min(1).max(200).describe('The agent token get_booking returned for this rental.'),
}
const decision = z.enum(['accept', 'contest'])

// How a hold works at every Hold shop. Fixed facts, the same for each shop; the amount comes from each item type.
export const HOLD_TERMS = {
  placed: 'at_pickup',
  how: 'a_paypal_authorization_the_renter_approves_in_paypal',
  amount_from: 'each_item_type_the_shop_published',
  released: 'after_the_return_and_any_claim_is_settled',
  charged_only: 'from_a_claim_with_photographs_that_a_person_at_the_shop_approved_and_the_renter_could_reply_to',
} as const
const holdTerms = z.strictObject({ placed: z.literal(HOLD_TERMS.placed), how: z.literal(HOLD_TERMS.how), amount_from: z.literal(HOLD_TERMS.amount_from), released: z.literal(HOLD_TERMS.released), charged_only: z.literal(HOLD_TERMS.charged_only) })

export type ToolAudience = 'public' | 'rental'

export type ToolDefinition = {
  readonly tier: ToolTier
  // Public tools need no identity; rental tools need the agent token for the rental they name.
  readonly audience: ToolAudience
  readonly scope: AgentScope | null
  readonly description: string
  readonly input: z.ZodObject
  readonly output: z.ZodObject
}

// Keeps each tool's own schemas in its type, so a handler's input and output are typed from them.
const tool = <Definition extends ToolDefinition>(definition: Definition): Definition => definition

export const TOOLS = {
  find_shops: tool({
    tier: 'read',
    audience: 'public',
    scope: null,
    description: 'Shops that take bookings through Hold, by place (a town or region) and kind of item.',
    input: z.strictObject({ place: z.string().trim().min(1).max(80).optional(), kind: z.enum(ITEM_CATEGORIES).optional() }),
    output: z.strictObject({ shops: z.array(z.strictObject({ shop, name: merchantWords, time_zone: z.string(), currency: z.string().length(3), kinds: z.array(z.enum(ITEM_CATEGORIES)) })) }),
  }),
  get_shop: tool({
    tier: 'read',
    audience: 'public',
    scope: null,
    description: 'One shop: its clock, currency, the languages its renter pages are served in, its reply period for a claim, and how holds work there.',
    input: z.strictObject({ shop }),
    output: z.strictObject({ shop, name: merchantWords, time_zone: z.string(), currency: z.string().length(3), languages: z.array(z.enum(LANGUAGES)), claim_reply_hours: z.number().int(), hold_terms: holdTerms }),
  }),
  check_availability: tool({
    tier: 'read',
    audience: 'public',
    scope: null,
    description: 'The item types free for a period, each with how many are free, its day rate, its fee for the period and its ordinary hold.',
    input: z.strictObject({ shop, starts_at: shopTime, ends_at: shopTime }),
    output: z.strictObject({
      shop,
      starts_at: instant,
      ends_at: instant,
      days: z.number().int(),
      item_types: z.array(z.strictObject({ item_type_id: z.uuid(), name: merchantWords, kind: z.enum(ITEM_CATEGORIES), available: z.number().int(), day_rate: amount, fee_for_period: amount, hold_each: amount })),
    }),
  }),
  get_damage_prices: tool({
    tier: 'read',
    audience: 'public',
    scope: null,
    description: 'The shop’s published damage price list, its wear policy and the hold terms, with their versions.',
    input: z.strictObject({ shop }),
    output: z.strictObject({
      shop,
      price_list_version: z.number().int(),
      wear_policy_version: z.number().int(),
      prices: z.array(z.strictObject({ code: z.string(), category: z.enum(PRICE_CATEGORIES), description: merchantWords, amount })),
      wear_policy: merchantWords,
      hold_terms: holdTerms,
    }),
  }),
  quote_rental: tool({
    tier: 'draft',
    audience: 'public',
    scope: null,
    description: 'A quote priced by Hold for a period and a count of each item type: the fee, the hold, the price list and wear policy versions, and when it expires. Nothing is held until create_booking.',
    input: z.strictObject({ shop, starts_at: shopTime, ends_at: shopTime, items: z.array(z.strictObject({ item_type_id: z.uuid(), count: z.number().int().min(1).max(10) })).min(1).max(10) }),
    output: z.strictObject({
      quote_id: z.uuid(),
      shop,
      starts_at: instant,
      ends_at: instant,
      days: z.number().int(),
      fee: amount,
      hold: amount,
      lines: z.array(z.strictObject({ item_type_id: z.uuid(), name: merchantWords, count: z.number().int(), day_rate: amount, hold_each: amount, fee: amount })),
      price_list_version: z.number().int(),
      wear_policy_version: z.number().int(),
      expires_at: instant,
    }),
  }),
  create_booking: tool({
    tier: 'draft',
    audience: 'public',
    scope: null,
    description:
      'Books from a quote. The booking keeps its items for fifteen minutes while the person approves the rental fee in PayPal at approval_url. The booking secret is returned once: keep it to call get_booking.',
    input: z.strictObject({ quote_id: z.uuid(), language: z.enum(LANGUAGES).optional() }),
    output: z.strictObject({ status: z.literal('awaiting_payment'), booking_secret: z.string(), approval_url: z.url(), pay_by: instant, fee: amount, hold: amount, starts_at: instant, ends_at: instant }),
  }),
  get_booking: tool({
    tier: 'read',
    audience: 'public',
    scope: null,
    description: 'Whether the fee of a booking is paid. Once PayPal’s capture of the fee is on record, the first call returns the agent token for the rental; it is issued once.',
    input: z.strictObject({ booking_secret: z.string().min(1).max(200) }),
    output: z.strictObject({
      status: z.enum(['awaiting_payment', 'paid', 'expired', 'cancelled']),
      pay_by: instant.nullable(),
      rental_id: z.uuid().nullable(),
      token: z.enum(['issued_now', 'issued_earlier', 'not_yet', 'none']),
      agent_token: z.string().nullable(),
      token_expires_at: instant.nullable(),
      scopes: z.array(z.enum(AGENT_SCOPES)),
    }),
  }),
  get_rental: tool({
    tier: 'read',
    audience: 'rental',
    scope: 'rental',
    description: 'The rental: where it stands, what is rented, the fee and hold agreed, when to pick up and when to return.',
    input: z.strictObject(rental),
    output: z.strictObject({ rental_id: z.uuid(), shop_name: merchantWords, time_zone: z.string(), state: z.enum(RENTAL_STATES), pick_up_from: instant, return_by: instant, items: z.array(z.strictObject({ name: merchantWords, count: z.number().int() })), fee: amount, hold: amount }),
  }),
  get_hold: tool({
    tier: 'read',
    audience: 'rental',
    scope: 'hold',
    description: 'The hold at pickup: where it stands, its amount and the dates PayPal keeps it valid.',
    input: z.strictObject(rental),
    output: z.strictObject({ rental_id: z.uuid(), state: z.enum([...HOLD_STATES, 'not_requested']), amount: amount.nullable(), agreed_at_booking: amount, assured_until: instant.nullable(), valid_until: instant.nullable() }),
  }),
  get_hold_approval_link: tool({
    tier: 'read',
    audience: 'rental',
    scope: 'hold',
    description: 'The PayPal link where the person approves the hold, once staff have asked for it at pickup. The person approves in PayPal.',
    input: z.strictObject(rental),
    output: z.strictObject({ rental_id: z.uuid(), status: z.enum(['awaiting_approval', 'not_requested', 'placed', 'unavailable']), approval_url: z.url().nullable() }),
  }),
  get_condition_report: tool({
    tier: 'read',
    audience: 'rental',
    scope: 'condition',
    description: 'How each item left at the handover: its photographs, with links that work for a few minutes, and the marks staff recorded.',
    input: z.strictObject(rental),
    output: z.strictObject({
      rental_id: z.uuid(),
      handed_over: z.boolean(),
      reply: z.enum([...CONDITION_REPLIES, 'none']),
      items: z.array(z.strictObject({ label: merchantWords, photos: z.array(z.strictObject({ view: z.string(), url: z.url().nullable() })), marks: z.array(z.strictObject({ view: z.string(), description: merchantWords })) })),
    }),
  }),
  get_claim: tool({
    tier: 'read',
    audience: 'rental',
    scope: 'claim',
    description: 'A claim the shop presented: its lines with their photographs and prices, the total, what would be taken from the hold, and the reply date.',
    input: z.strictObject(rental),
    output: z.strictObject({
      rental_id: z.uuid(),
      presented: z.boolean(),
      state: z.string().nullable(),
      total: amount.nullable(),
      reply_due_at: instant.nullable(),
      lines: z.array(z.strictObject({ description: merchantWords, reason: merchantWords, amount, before_photo_url: z.url().nullable(), after_photo_url: z.url().nullable() })),
      from_hold: amount.nullable(),
      released: amount.nullable(),
      invoiced: amount.nullable(),
    }),
  }),
  draft_claim_reply: tool({
    tier: 'draft',
    audience: 'rental',
    scope: 'claim',
    description: 'Saves a reply to the claim for the person to read on their rental link. It decides nothing.',
    input: z.strictObject({ ...rental, decision, comment: z.string().trim().max(1000) }),
    output: z.strictObject({ rental_id: z.uuid(), saved: z.literal(true) }),
  }),
  submit_claim_reply: tool({
    tier: 'act_under_mandate',
    audience: 'rental',
    scope: 'claim',
    description:
      'Accepts or contests a claim, which needs the person or a mandate they granted. Without one it changes nothing and returns human_confirmation_required: the person answers on their rental link with the one-time code Hold emails them.',
    input: z.strictObject({ ...rental, decision, comment: z.string().trim().max(1000).optional() }),
    output: z.strictObject({ rental_id: z.uuid(), status: z.literal('human_confirmation_required'), confirm_where: z.literal('the_claim_page_of_the_renter_link_with_the_emailed_one_time_code'), link: z.url() }),
  }),
  get_record: tool({
    tier: 'read',
    audience: 'rental',
    scope: 'record',
    description: 'The versions of the rental’s evidence record shared with the renter, with the fingerprints of each document.',
    input: z.strictObject(rental),
    output: z.strictObject({ rental_id: z.uuid(), versions: z.array(z.strictObject({ version: z.number().int(), state: z.string(), created_at: instant, pdf_sha256: z.string().nullable(), manifest_sha256: z.string().nullable() })) }),
  }),
} as const satisfies Record<string, ToolDefinition>

export type ToolName = keyof typeof TOOLS
export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[]
export type ToolInput<Name extends ToolName> = z.infer<(typeof TOOLS)[Name]['input']>
export type ToolOutput<Name extends ToolName> = z.infer<(typeof TOOLS)[Name]['output']>

// Tools section 8.3 lists that this server does not offer yet, and why. They are not listed to clients.
export const NOT_OFFERED = {
  request_extension: 'Hold has no extension flow yet: a rental’s end date and fee cannot change after booking.',
  report_incident: 'An incident report needs photographs taken on the renter’s phone through their rental link.',
  get_negotiation: 'The advocates of extensions.md section 9 are built separately.',
  submit_offer: 'The advocates of extensions.md section 9 are built separately.',
} as const
