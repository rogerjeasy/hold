import { z } from 'zod'

const cents = z.number().int().nonnegative()
const timestamp = z.iso.datetime({ offset: true })
const region = z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1) })
const share = z.strictObject({ count: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
const accessory = z.strictObject({ name: z.string(), count: z.number().int().nonnegative() })
export const evidencePhotoSchema = z.strictObject({
  id: z.uuid(), view: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), receivedAt: timestamp,
  displayKey: z.string(), supersededAt: timestamp.nullable(), simulated: z.boolean(),
})
export const evidenceSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  shop: z.strictObject({ name: z.string(), timeZone: z.string() }),
  rental: z.strictObject({ id: z.uuid(), startsAt: timestamp, endsAt: timestamp, state: z.string(), currency: z.string().length(3), feeCents: cents, holdCents: cents, language: z.enum(['en', 'fr', 'de', 'es']), simulated: z.boolean(), conditionReply: z.string().nullable(), conditionRepliedAt: timestamp.nullable() }),
  agreement: z.strictObject({ priceListVersion: z.number().int(), publishedText: z.string().nullable(), prices: z.array(z.strictObject({ id: z.uuid(), description: z.string(), amountCents: cents, currency: z.string().length(3), category: z.string() })), wearPolicyVersion: z.number().int(), wearRules: z.string() }),
  items: z.array(z.strictObject({ id: z.uuid(), label: z.string(), serial: z.string().nullable(), accessoriesOut: z.array(accessory), accessoriesBack: z.array(accessory).nullable(), sessions: z.array(z.strictObject({ id: z.uuid(), kind: z.string(), sealedAt: timestamp, manifest: z.string(), manifestFingerprint: z.string(), previousManifestFingerprint: z.string().nullable(), photos: z.array(evidencePhotoSchema) })) })),
  comparisons: z.array(z.strictObject({ id: z.uuid(), handoverSessionId: z.uuid(), returnSessionId: z.uuid(), state: z.string(), model: z.string().nullable(), promptVersion: z.string().nullable(), simulated: z.boolean(), deferredReason: z.string().nullable(), findings: z.array(z.strictObject({ id: z.uuid(), view: z.string(), region, class: z.string(), confidence: z.number(), description: z.string(), secondLookConfirmed: z.boolean().nullable() })) })),
  claim: z.strictObject({ id: z.uuid(), state: z.string(), totalCents: cents, presentedAt: timestamp.nullable(), replyDueAt: timestamp.nullable(), lines: z.array(z.strictObject({ id: z.uuid(), description: z.string(), amountCents: cents, priceEntryId: z.uuid(), findingId: z.uuid().nullable(), reason: z.string().nullable(), actorName: z.string().nullable() })) }).nullable(),
  approvals: z.array(z.strictObject({ id: z.uuid(), subject: z.string(), decision: z.string(), method: z.string(), actorName: z.string().nullable(), changes: z.array(z.record(z.string(), z.unknown())), createdAt: timestamp })),
  replies: z.array(z.strictObject({ id: z.uuid(), decision: z.string(), comment: z.string().nullable(), addedPhotoIds: z.array(z.string()), createdAt: timestamp })),
  payments: z.array(z.strictObject({ id: z.uuid(), kind: z.string(), amountCents: cents, currency: z.string().length(3), paypalReference: z.string(), occurredAt: timestamp })),
  invoices: z.array(z.strictObject({ id: z.uuid(), paypalInvoiceId: z.string().nullable(), state: z.string(), amountCents: cents, currency: z.string().length(3) })),
  authorizations: z.array(z.strictObject({ reference: z.string(), state: z.string(), amountCents: cents, currency: z.string().length(3), createdAt: timestamp, validUntil: timestamp })),
  paypalMode: z.enum(['sandbox', 'live']).nullable(),
  // The accepted evaluation run the comparison was last measured in (extensions.md section 5.5). Older versions
  // of the record were written before it existed.
  measurement: z.strictObject({ pipelineVersion: z.string(), dataSetVersion: z.string(), completedAt: timestamp, damageFound: share, cleanWronglyFlagged: share }).nullable().default(null),
})
export type EvidenceSnapshot = z.infer<typeof evidenceSnapshotSchema>
