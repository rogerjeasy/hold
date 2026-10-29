import { parseAmount } from './currency.ts'
import { descriptionProblem, priceCode } from './price-list.ts'
import type { DescriptionProblem, PriceCategory } from './price-list.ts'

// The price list as a shop edits it before publishing it (extensions.md section 12.5). The rules are publishing's own,
// applied cell by cell, so the editor can say exactly which cell is wrong before anything is sent.

export type PriceCellProblems = { readonly description?: DescriptionProblem; readonly amount?: 'amount_invalid' | 'amount_zero' }

export function checkPriceRows(rows: readonly { readonly description: string; readonly amount: string }[], currency: string): PriceCellProblems[] {
  const seen = new Set<string>()
  return rows.map((row) => {
    const description = descriptionProblem(row.description, seen)
    const parsed = parseAmount(row.amount, currency)
    const amount = parsed === undefined ? 'amount_invalid' : parsed.cents === 0 ? 'amount_zero' : undefined
    return { ...(description === undefined ? {} : { description }), ...(amount === undefined ? {} : { amount }) }
  })
}

// The code each entry is published under: from its description, and numbered when two descriptions make one code.
export function draftCodes(descriptions: readonly string[]): string[] {
  const codes = new Set<string>()
  return descriptions.map((description, index) => {
    let code = priceCode(description, index)
    if (codes.has(code)) code = `${code}-${String(index + 1)}`
    codes.add(code)
    return code
  })
}

type VersionEntry = { readonly description: string; readonly category: PriceCategory; readonly amountCents: number }
type CodedEntry = VersionEntry & { readonly code: string }
export type PriceListDiff = {
  readonly added: readonly CodedEntry[]
  readonly removed: readonly CodedEntry[]
  readonly changed: readonly { readonly code: string; readonly description: string; readonly from: Omit<VersionEntry, 'description'>; readonly to: Omit<VersionEntry, 'description'> }[]
  readonly unchanged: number
  readonly wearPolicyChanged: boolean
}

const coded = (entries: readonly VersionEntry[]): CodedEntry[] => {
  const codes = draftCodes(entries.map((entry) => entry.description))
  return entries.map((entry, index) => ({ code: codes[index] ?? '', description: entry.description, category: entry.category, amountCents: entry.amountCents }))
}

// What changed between two versions of a shop's terms, entry by entry, matched by code. A renter agreed to one version
// at booking; this is how a shop sees what a renter on the older one did not agree to.
export function diffPriceLists(before: { readonly entries: readonly VersionEntry[]; readonly wearPolicy: string }, after: { readonly entries: readonly VersionEntry[]; readonly wearPolicy: string }): PriceListDiff {
  const older = coded(before.entries)
  const newer = coded(after.entries)
  const byCode = new Map(older.map((entry) => [entry.code, entry]))
  const changed: PriceListDiff['changed'][number][] = []
  let unchanged = 0
  for (const entry of newer) {
    const earlier = byCode.get(entry.code)
    if (earlier === undefined) continue
    if (earlier.amountCents === entry.amountCents && earlier.category === entry.category) unchanged += 1
    else changed.push({ code: entry.code, description: entry.description, from: { category: earlier.category, amountCents: earlier.amountCents }, to: { category: entry.category, amountCents: entry.amountCents } })
  }
  const newerCodes = new Set(newer.map((entry) => entry.code))
  return {
    added: newer.filter((entry) => !byCode.has(entry.code)),
    removed: older.filter((entry) => !newerCodes.has(entry.code)),
    changed,
    unchanged,
    wearPolicyChanged: before.wearPolicy.trim() !== after.wearPolicy.trim(),
  }
}
