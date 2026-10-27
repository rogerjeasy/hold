import { createHash } from 'node:crypto'
import type { EvidenceSnapshot } from '@hold/db'

export const evidenceFixtureId = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
export const evidenceFixtureTime = '2026-10-20T10:00:00.000Z'
export function evidenceRenderFixture(): EvidenceSnapshot {
  const session = (value: number, kind: string, previous: string | null) => {
    const photo = { id: evidenceFixtureId(value + 10), view: 'left', sha256: 'a'.repeat(64), receivedAt: evidenceFixtureTime, displayKey: 'private/display/key', supersededAt: null, simulated: true }
    const manifest = JSON.stringify({ session: evidenceFixtureId(value), item: evidenceFixtureId(2), kind, sealedAt: evidenceFixtureTime, previous, photos: [{ view: photo.view, sha256: photo.sha256, receivedAt: photo.receivedAt }] })
    return { id: evidenceFixtureId(value), kind, sealedAt: evidenceFixtureTime, manifest, manifestFingerprint: createHash('sha256').update(manifest).digest('hex'), previousManifestFingerprint: previous, photos: [photo] }
  }
  const handover = session(3, 'handover', null)
  return {
    schemaVersion: 1, shop: { name: 'Atelier vélo', timeZone: 'Europe/Zurich' },
    rental: { id: evidenceFixtureId(1), startsAt: evidenceFixtureTime, endsAt: evidenceFixtureTime, state: 'closed', currency: 'CHF', feeCents: 2000, holdCents: 10000, language: 'en', simulated: true, conditionReply: 'confirmed', conditionRepliedAt: evidenceFixtureTime },
    agreement: { priceListVersion: 2, publishedText: 'Agreed repair prices', prices: [{ id: evidenceFixtureId(30), description: 'Repair scratch', amountCents: 1250, currency: 'CHF', category: 'repair' }], wearPolicyVersion: 4, wearRules: 'Existing scuffs are normal wear.' },
    items: [{ id: evidenceFixtureId(2), label: 'Touring bicycle', serial: 'SERIAL-007', accessoriesOut: [{ name: 'Lock', count: 1 }], accessoriesBack: [{ name: 'Lock', count: 1 }], sessions: [handover, session(4, 'return', handover.manifestFingerprint)] }],
    comparisons: [{ id: evidenceFixtureId(20), handoverSessionId: handover.id, returnSessionId: evidenceFixtureId(4), state: 'complete', model: 'comparison-model', promptVersion: 'prompt-7', simulated: true, deferredReason: null, findings: [{ id: evidenceFixtureId(21), view: 'left', region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, class: 'uncertain', confidence: 0.6, description: 'Uncertain scratch; needs a person.', secondLookConfirmed: false }] }],
    claim: { id: evidenceFixtureId(22), state: 'paid', totalCents: 1250, presentedAt: evidenceFixtureTime, replyDueAt: evidenceFixtureTime, lines: [{ id: evidenceFixtureId(23), description: 'Repair scratch', amountCents: 1250, priceEntryId: evidenceFixtureId(30), findingId: null, reason: 'Renter reported impact', actorName: 'René Müller' }] },
    approvals: [{ id: evidenceFixtureId(24), subject: 'claim', decision: 'approved', method: 'screen', actorName: 'René Müller', changes: [{ description: 'Reduced repair', amountCents: 1250 }], createdAt: evidenceFixtureTime }],
    replies: [{ id: evidenceFixtureId(25), decision: 'accepted', comment: '<script>quoted renter text</script>', addedPhotoIds: [evidenceFixtureId(14)], createdAt: evidenceFixtureTime }],
    payments: [{ id: evidenceFixtureId(26), kind: 'deposit_capture', amountCents: 1250, currency: 'CHF', paypalReference: 'VERIFIED-CAPTURE', occurredAt: evidenceFixtureTime }],
    invoices: [{ id: evidenceFixtureId(27), paypalInvoiceId: 'INVOICE-UNPAID', state: 'sent', amountCents: 1250, currency: 'CHF' }],
    authorizations: [{ reference: 'AUTH-EXPIRED', state: 'expired', amountCents: 10000, currency: 'CHF', createdAt: evidenceFixtureTime, validUntil: evidenceFixtureTime }], paypalMode: 'sandbox', measurement: null, negotiation: null,
  }
}
