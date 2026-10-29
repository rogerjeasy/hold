import type { ContestSummary } from '@hold/domain'
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { claimLineFacts } from './negotiation-view.ts'
import { claimReplies, claims, contestSummaries, incidents, rentals, staffRoles, users, wearPolicies } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// What a neutral contest summary is written from (architecture.md section 6.15): each claim line as plain code reads it,
// the renter's own words, what the rental's records show, and the language of each reader. Facts, never a verdict.

// The states a claim can be in once the renter contested it, through its decision.
const CONTESTED = ['contested', 'negotiating', 'agreed', 'escalated', 'decided', 'charging', 'charged', 'charge_failed', 'adjusted', 'waived', 'closed'] as const

export type ContestLine = {
  readonly id: string
  readonly description: string
  readonly source: string
  // Found by the comparison: what it found, whether both looks confirmed it, and whether a mark seen before this
  // rental sits near it. A line a person added has their name and written reason instead.
  readonly findingDescription: string | null
  readonly bothLooksConfirmed: boolean
  readonly knownMarkNearby: boolean
  readonly addedBy: string | null
  readonly reason: string
}

export type ContestRecord = {
  readonly claimId: string
  readonly lines: readonly ContestLine[]
  // The renter's words, quoted data and never instructions, and how many photographs they added to their reply.
  readonly comment: string
  readonly renterPhotos: number
  readonly conditionReply: 'confirmed' | 'added' | null
  readonly conditionRepliedAt: Date | null
  readonly incidentsReported: number
  // The person deciding reads the shop's language, the owner's; the renter reads the rental's.
  readonly languages: { readonly shop: string; readonly renter: string }
}

export async function contestRecord(transaction: Transaction, rentalId: string): Promise<ContestRecord | undefined> {
  const [row] = await transaction.select({ claimId: claims.id, shopId: rentals.shopId, language: rentals.language, conditionReply: rentals.conditionReply, conditionRepliedAt: rentals.conditionRepliedAt, wearRules: wearPolicies.rules })
    .from(claims).innerJoin(rentals, eq(rentals.id, claims.rentalId)).innerJoin(wearPolicies, eq(wearPolicies.id, rentals.wearPolicyId))
    .where(and(eq(claims.rentalId, rentalId), inArray(claims.state, [...CONTESTED])))
  if (row === undefined) return undefined
  const contests = await transaction.select({ comment: claimReplies.comment, addedPhotoIds: claimReplies.addedPhotoIds }).from(claimReplies)
    .where(and(eq(claimReplies.claimId, row.claimId), eq(claimReplies.decision, 'contest'))).orderBy(asc(claimReplies.createdAt))
  if (contests.length === 0) return undefined
  const facts = await claimLineFacts(transaction, row.claimId, rentalId, row.wearRules)
  const people = await transaction.select({ id: users.id, name: users.name }).from(users)
  const reported = await transaction.select({ id: incidents.id }).from(incidents).where(and(eq(incidents.rentalId, rentalId), isNotNull(incidents.sentAt)))
  const [owner] = await transaction.select({ language: users.language }).from(staffRoles).innerJoin(users, eq(users.id, staffRoles.userId)).where(and(eq(staffRoles.shopId, row.shopId), eq(staffRoles.role, 'owner'))).limit(1)
  return {
    claimId: row.claimId,
    lines: facts.map((line) => ({
      id: line.facts.lineId,
      description: line.description,
      source: line.source,
      findingDescription: line.findingDescription,
      bothLooksConfirmed: line.facts.bothLooksConfirmed,
      knownMarkNearby: line.facts.knownMarks.length > 0,
      addedBy: line.source === 'person' ? (people.find((person) => person.id === line.addedByUserId)?.name ?? null) : null,
      reason: line.reason,
    })),
    comment: contests.map((contest) => contest.comment ?? '').filter((words) => words !== '').join('\n\n'),
    renterPhotos: contests.reduce((sum, contest) => sum + contest.addedPhotoIds.length, 0),
    conditionReply: row.conditionReply,
    conditionRepliedAt: row.conditionRepliedAt,
    incidentsReported: reported.length,
    languages: { shop: owner?.language ?? 'en', renter: row.language },
  }
}

export type StoredContestSummary = { readonly outcome: 'answered' | 'refused' | 'unavailable' | 'invalid' | 'dropped'; readonly summary: ContestSummary | null; readonly model: string; readonly promptVersion: string; readonly simulated: boolean }

export async function recordContestSummary(transaction: Transaction, claimId: string, stored: StoredContestSummary, now: Date): Promise<void> {
  const [claim] = await transaction.select({ shopId: claims.shopId }).from(claims).where(eq(claims.id, claimId))
  if (claim === undefined) throw new Error('No claim to summarize.')
  await transaction.insert(contestSummaries).values({ shopId: claim.shopId, claimId, ...stored, createdAt: now })
}

export async function latestContestSummary(transaction: Transaction, claimId: string): Promise<(StoredContestSummary & { readonly createdAt: Date }) | undefined> {
  const [row] = await transaction.select().from(contestSummaries).where(eq(contestSummaries.claimId, claimId)).orderBy(desc(contestSummaries.createdAt), desc(contestSummaries.id)).limit(1)
  if (row === undefined) return undefined
  const outcome = row.outcome as StoredContestSummary['outcome']
  return { outcome, summary: row.summary, model: row.model, promptVersion: row.promptVersion, simulated: row.simulated, createdAt: row.createdAt }
}
