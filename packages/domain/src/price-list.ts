import { amountText } from './currency.ts'
import type { Money } from './money.ts'
import { slugOf } from './slug.ts'

// A shop's published prices for damage, loss and lateness, and what it counts as ordinary wear. A renter agrees to
// one version at booking, and a claim is priced from that version alone (architecture.md section 7.2).

export const PRICE_CATEGORIES = ['damage', 'loss', 'lateness', 'cleaning'] as const
export type PriceCategory = (typeof PRICE_CATEGORIES)[number]

export const PRICE_LIST_LIMITS = { entries: 60, description: 120, wearPolicy: 4000 } as const

export type PriceEntryDraft = { readonly description: string; readonly category: PriceCategory; readonly amount: Money }

export type PriceListDraft = {
  readonly currency: string
  readonly entries: readonly PriceEntryDraft[]
  readonly wearPolicy: string
}

export type PriceListProblem =
  | { readonly kind: 'no_entries' }
  | { readonly kind: 'too_many_entries' }
  | { readonly kind: 'description_missing'; readonly entry: number }
  | { readonly kind: 'description_too_long'; readonly entry: number }
  | { readonly kind: 'description_repeated'; readonly entry: number }
  | { readonly kind: 'amount_zero'; readonly entry: number }
  | { readonly kind: 'wrong_currency'; readonly entry: number }
  | { readonly kind: 'wear_policy_missing' }
  | { readonly kind: 'wear_policy_too_long' }

export function checkPriceList(draft: PriceListDraft): readonly PriceListProblem[] {
  const problems: PriceListProblem[] = []
  if (draft.entries.length === 0) problems.push({ kind: 'no_entries' })
  if (draft.entries.length > PRICE_LIST_LIMITS.entries) problems.push({ kind: 'too_many_entries' })
  const seen = new Set<string>()
  draft.entries.forEach((entry, index) => {
    const description = entry.description.trim()
    const key = description.toLowerCase()
    if (description === '') problems.push({ kind: 'description_missing', entry: index })
    else if (description.length > PRICE_LIST_LIMITS.description) problems.push({ kind: 'description_too_long', entry: index })
    else if (seen.has(key)) problems.push({ kind: 'description_repeated', entry: index })
    seen.add(key)
    if (entry.amount.cents === 0) problems.push({ kind: 'amount_zero', entry: index })
    if (entry.amount.currency !== draft.currency) problems.push({ kind: 'wrong_currency', entry: index })
  })
  const wear = draft.wearPolicy.trim()
  if (wear === '') problems.push({ kind: 'wear_policy_missing' })
  if (wear.length > PRICE_LIST_LIMITS.wearPolicy) problems.push({ kind: 'wear_policy_too_long' })
  return problems
}

// A stable code for an entry, from its description: "Deep scratch on the frame" becomes "deep-scratch-on-the-frame".
export function priceCode(description: string, index: number): string {
  const slug = slugOf(description)
  return slug === '' ? `entry-${String(index + 1)}` : slug
}

// The plain text a renter reads before booking: one line per price, in the order the shop wrote them.
export function publishedText(draft: PriceListDraft): string {
  return draft.entries.map((entry) => `${entry.description.trim()}: ${amountText(entry.amount)} ${draft.currency}`).join('\n')
}
