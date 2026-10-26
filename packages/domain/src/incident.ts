import { mentionsSafety } from './incident-safety.ts'
import type { Money } from './money.ts'
import { fail, ok } from './result.ts'
import type { Result } from './result.ts'
import type { Transitions } from './state-machine.ts'

// The incident desk (extensions.md section 10). A renter reports something that happened during a rental; Hold sorts
// it into one of four kinds and offers the matching next step. These rules decide the sorting, who may agree to what,
// and what staff may do with an agreed line. Hold never tells a renter an item is safe.

export const INCIDENT_KINDS = ['small_damage', 'mechanical_fault', 'theft_or_loss', 'unsafe_or_unclear'] as const
export type IncidentKind = (typeof INCIDENT_KINDS)[number]

// What the renter says happened, in their own choice of words on the form. "not_sure" is not a kind: it sends the
// report to a person.
export const INCIDENT_HINTS = ['damage', 'fault', 'gone', 'unsafe', 'not_sure'] as const
export type IncidentHint = (typeof INCIDENT_HINTS)[number]

export const INCIDENT_STATES = ['reported', 'triaged', 'agreed', 'shop_matter', 'awaiting_staff', 'claim_opened', 'resolved', 'withdrawn'] as const
export type IncidentState = (typeof INCIDENT_STATES)[number]

// extensions.md section 10.5. An incident never moves back.
export const INCIDENT_TRANSITIONS: Transitions<IncidentState> = {
  reported: ['triaged', 'withdrawn'],
  triaged: ['agreed', 'shop_matter', 'awaiting_staff', 'withdrawn'],
  awaiting_staff: ['agreed', 'shop_matter', 'claim_opened'],
  agreed: ['resolved'],
  shop_matter: ['resolved'],
  claim_opened: ['resolved'],
  resolved: [],
  withdrawn: [],
}

// The sorting's ceilings and thresholds. One model call, no tools, short output, a hard time limit: the report is
// stored before the call and stands without it.
export const INCIDENT_LIMITS = { minConfidence: 0.8, descriptionLength: 1000, maxPhotos: 4, maxCalls: 1, maxTokens: 1024, maxMilliseconds: 20_000, confirmationLength: 400 } as const

// What the model answered, already checked against its schema.
export type IncidentTriage = { readonly kind: IncidentKind; readonly confidence: number; readonly priceCode: string | null }

export type SortInput = {
  readonly hint: IncidentHint
  readonly description: string
  // The model's answer, or null when it was unavailable, refused or answered out of shape.
  readonly triage: IncidentTriage | null
  // The codes of the price list the renter agreed to at booking.
  readonly priceCodes: readonly string[]
  readonly photographed: boolean
}

export type Sorted = { readonly kind: IncidentKind; readonly next: 'triaged' | 'shop_matter' | 'awaiting_staff'; readonly priceCode: string | null; readonly safety: boolean }

// How cautious each kind's routing is. Small damage is the only kind a renter agrees to pay for.
const CAUTION: Readonly<Record<IncidentKind, number>> = { small_damage: 0, mechanical_fault: 1, theft_or_loss: 1, unsafe_or_unclear: 2 }

const HINT_KIND: Readonly<Record<IncidentHint, IncidentKind>> = { damage: 'small_damage', fault: 'mechanical_fault', gone: 'theft_or_loss', unsafe: 'unsafe_or_unclear', not_sure: 'unsafe_or_unclear' }

// The more cautious of two kinds. Two different kinds of the same weight are unclear.
function cautious(first: IncidentKind, second: IncidentKind): IncidentKind {
  if (first === second) return first
  if (CAUTION[first] === CAUTION[second]) return 'unsafe_or_unclear'
  return CAUTION[first] > CAUTION[second] ? first : second
}

// Code decides first, from the renter's own choice and the safety words. The model can only make that more cautious.
// Without a model, a renter's "damage" cannot be matched to a price and is unclear until a person looks.
export function sortIncident(input: SortInput): Sorted {
  const safety = mentionsSafety(input.description)
  const byCode = safety ? 'unsafe_or_unclear' : HINT_KIND[input.hint]
  const byModel = input.triage === null ? (byCode === 'small_damage' ? 'unsafe_or_unclear' : byCode) : input.triage.confidence >= INCIDENT_LIMITS.minConfidence ? input.triage.kind : 'unsafe_or_unclear'
  const kind = cautious(byCode, byModel)
  if (kind === 'mechanical_fault') return { kind, next: 'shop_matter', priceCode: null, safety }
  const code = input.triage?.priceCode ?? null
  if (kind === 'small_damage' && input.photographed && code !== null && input.priceCodes.includes(code)) return { kind, next: 'triaged', priceCode: code, safety }
  return { kind, next: 'awaiting_staff', priceCode: null, safety }
}

// Only small damage, sorted with a price from the agreed list, may be agreed by the renter. The amount is the entry's.
export function mayAgree(incident: { readonly state: IncidentState; readonly kind: IncidentKind | null; readonly offeredPriceEntryId: string | null }): boolean {
  return incident.state === 'triaged' && incident.kind === 'small_damage' && incident.offeredPriceEntryId !== null
}

export type KeptLineProblem = 'raises_agreed_line' | 'empty_line'

// At the return, staff confirm the agreed line after seeing the item: they keep it, lower it, or leave it out. They can
// never raise it: the renter agreed to the photographed damage at the published price, and no more.
export function checkKeptLine(agreed: Money, kept: Money): Result<Money, KeptLineProblem> {
  if (kept.currency !== agreed.currency || kept.cents > agreed.cents) return fail('raises_agreed_line')
  if (kept.cents === 0) return fail('empty_line')
  return ok(kept)
}
