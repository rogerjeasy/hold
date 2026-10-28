import { wearClauses } from '@hold/domain'
import type { PriceCategory, Region } from '@hold/domain'
import { asc, eq } from 'drizzle-orm'
import { conditionReport } from './capture-repository.ts'
import { claimWorkspace } from './claim-query.ts'
import { itemMarks } from './negotiation-view.ts'
import type { FINDING_CLASSES } from './schema/enums.ts'
import { comparisons, findings, negotiations, priceEntries, priceLists, rentalItems, rentals, wearPolicies } from './schema/index.ts'
import type { Transaction } from './scope.ts'

type FindingClass = (typeof FINDING_CLASSES)[number]

// The records an advocate may read before it moves (extensions.md section 9.13), for Hold's advocates and a renter's
// own assistant alike: the claim's lines with their findings and photographs, the price list and wear policy the renter
// agreed to, with their versions, the marks seen before the rental, and the condition report from the handover. It
// holds no mandate and no limit, so it may go to either side.

export type LineEvidence = {
  readonly lineId: string
  readonly description: string
  readonly reason: string
  readonly publishedCents: number
  // What the comparison found, and what its second look said. A line a person added has none.
  readonly finding: { readonly view: string; readonly findingClass: FindingClass; readonly confidence: number; readonly description: string; readonly secondLookConfirmed: boolean | null; readonly region: Region; readonly alignment: number | null } | null
  // The display copies of the line's view at the handover and at the return, where they exist.
  readonly photos: { readonly view: string | null; readonly handoverKey: string | null; readonly returnKey: string | null }
}

export type NegotiationEvidence = {
  readonly currency: string
  readonly lines: readonly LineEvidence[]
  readonly priceList: { readonly version: number; readonly entries: readonly { readonly code: string; readonly category: PriceCategory; readonly description: string; readonly cents: number }[] }
  readonly wearPolicy: { readonly version: number; readonly clauses: readonly { readonly id: string; readonly text: string }[] }
  readonly knownMarks: readonly { readonly markId: string; readonly view: string; readonly description: string; readonly region: Region }[]
  readonly conditionReport: { readonly reply: string | null; readonly items: readonly { readonly label: string; readonly marks: readonly { readonly view: string; readonly description: string }[] }[] } | null
}

export async function negotiationEvidence(transaction: Transaction, negotiationId: string): Promise<NegotiationEvidence | undefined> {
  const [negotiation] = await transaction.select({ rentalId: negotiations.rentalId, currency: negotiations.currency, openedAt: negotiations.openedAt }).from(negotiations).where(eq(negotiations.id, negotiationId))
  if (negotiation === undefined) return undefined
  const { rentalId } = negotiation
  const [rental] = await transaction.select({ priceListId: rentals.priceListId, wearPolicyId: rentals.wearPolicyId }).from(rentals).where(eq(rentals.id, rentalId))
  const workspace = await claimWorkspace(transaction, rentalId)
  if (rental === undefined || workspace === undefined) return undefined
  const [list] = await transaction.select({ version: priceLists.version }).from(priceLists).where(eq(priceLists.id, rental.priceListId))
  const entries = await transaction.select({ code: priceEntries.code, category: priceEntries.category, description: priceEntries.description, cents: priceEntries.amountCents }).from(priceEntries).where(eq(priceEntries.priceListId, rental.priceListId)).orderBy(asc(priceEntries.position))
  const [wear] = await transaction.select({ version: wearPolicies.version, rules: wearPolicies.rules }).from(wearPolicies).where(eq(wearPolicies.id, rental.wearPolicyId))
  const lines = await Promise.all(workspace.lines.map(async (line): Promise<LineEvidence> => {
    const [finding] = line.findingId === null ? [] : await transaction.select({ view: findings.view, findingClass: findings.class, confidence: findings.confidence, description: findings.description, secondLookConfirmed: findings.secondLookConfirmed, region: findings.region, alignment: comparisons.alignment }).from(findings).innerJoin(comparisons, eq(comparisons.id, findings.comparisonId)).where(eq(findings.id, line.findingId))
    return {
      lineId: line.id,
      description: line.description,
      reason: line.reason ?? line.findingDescription ?? line.incidentDescription ?? '',
      publishedCents: line.amountCents,
      finding: finding === undefined ? null : { ...finding, alignment: finding.alignment?.[finding.view] ?? null },
      photos: { view: finding?.view ?? null, handoverKey: line.beforeKey, returnKey: line.afterKey },
    }
  }))
  const items = await transaction.select({ itemId: rentalItems.itemId }).from(rentalItems).where(eq(rentalItems.rentalId, rentalId))
  const marks = (await Promise.all(items.map((item) => itemMarks(transaction, item.itemId, rentalId)))).flat().filter((mark) => mark.seenBeforeRental)
  const report = await conditionReport(transaction, rentalId, negotiation.openedAt)
  return {
    currency: negotiation.currency,
    lines,
    priceList: { version: list?.version ?? 0, entries },
    wearPolicy: { version: wear?.version ?? 0, clauses: wearClauses(wear?.rules ?? '') },
    knownMarks: marks.map((mark) => ({ markId: mark.id, view: mark.view, description: mark.description, region: mark.region })),
    conditionReport: report === undefined ? null : { reply: report.reply, items: report.items.map((item) => ({ label: item.label, marks: item.marks.map((mark) => ({ view: mark.view, description: mark.description })) })) },
  }
}
