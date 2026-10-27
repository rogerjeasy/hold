import { verifyTranscript } from '@hold/db'
import type { EvidenceSnapshot } from '@hold/db'
import { formatMoney } from '@hold/domain'
import type { EvidenceDocument } from './evidence-document-layout.ts'

export function renderAgreement(context: EvidenceDocument, snapshot: EvidenceSnapshot, version: number, createdAt: Date) {
  const { rental, agreement } = snapshot
  const amount = (cents: number, currency = rental.currency) => formatMoney({ cents, currency }, rental.language)
  context.heading(context.label('title'))
  context.line('rental', rental.id)
  context.line('version', version)
  context.line('created', `${createdAt.toISOString()} / ${snapshot.shop.timeZone}`)
  context.line('period', `${rental.startsAt} - ${rental.endsAt}`)
  context.line('state', rental.state)
  context.line('fee', amount(rental.feeCents))
  context.line('deposit', amount(rental.holdCents))
  if (snapshot.paypalMode === 'sandbox') context.paragraph(context.label('sandbox'))
  if (rental.simulated) context.paragraph(context.label('simulated'))
  context.heading(context.label('agreement'))
  context.line('prices', agreement.priceListVersion)
  context.paragraph(agreement.publishedText ?? context.label('missing'))
  for (const price of agreement.prices) {
    context.room(65)
    context.line('price', `${price.description}: ${amount(price.amountCents, price.currency)}`)
    context.paragraph(`${price.id} / ${price.category}`)
  }
  context.line('policy', agreement.wearPolicyVersion)
  context.paragraph(agreement.wearRules)
}

export function renderComparisons(context: EvidenceDocument, snapshot: EvidenceSnapshot) {
  context.heading(context.label('comparison'))
  if (snapshot.comparisons.length === 0) context.paragraph(context.label('missing'))
  for (const comparison of snapshot.comparisons) {
    context.line('comparison', comparison.id)
    context.line('session', `${comparison.handoverSessionId} / ${comparison.returnSessionId}`)
    context.line('state', comparison.state)
    if (comparison.simulated) context.paragraph(context.label('simulated'))
    context.line('model', comparison.model)
    context.line('prompt', comparison.promptVersion)
    if (comparison.deferredReason !== null) context.line('deferred', comparison.deferredReason)
    for (const finding of comparison.findings) {
      context.line('finding', `${finding.id} / ${finding.view}`)
      context.line('classification', finding.class)
      context.paragraph(finding.description)
      context.line('confidence', finding.confidence)
      context.line('secondLook', finding.secondLookConfirmed === null ? null : context.label(finding.secondLookConfirmed ? 'yes' : 'no'))
    }
  }
  // Counts only, as everywhere a measured figure appears. The figures themselves stay in English: they are data.
  const measured = snapshot.measurement
  context.line('measured', measured === null ? context.label('notMeasured') : `${measured.completedAt.slice(0, 10)} · ${measured.pipelineVersion} · damage found ${String(measured.damageFound.count)} of ${String(measured.damageFound.total)} · clean returns wrongly flagged ${String(measured.cleanWronglyFlagged.count)} of ${String(measured.cleanWronglyFlagged.total)}`)
}

export function renderDecisions(context: EvidenceDocument, snapshot: EvidenceSnapshot) {
  const amount = (cents: number) => formatMoney({ cents, currency: snapshot.rental.currency }, snapshot.rental.language)
  context.heading(context.label('claim'))
  if (snapshot.claim === null) context.paragraph(context.label('missing'))
  else {
    const claim = snapshot.claim
    context.line('claim', claim.id)
    context.line('state', claim.state)
    context.line('total', amount(claim.totalCents))
    context.line('presented', claim.presentedAt)
    context.line('due', claim.replyDueAt)
    for (const line of claim.lines) {
      context.paragraph(`${line.id}: ${line.description} / ${amount(line.amountCents)}`)
      context.line('price', line.priceEntryId)
      if (line.findingId) context.line('finding', line.findingId)
      if (line.reason !== null) context.line('reason', line.reason)
      if (line.actorName !== null) context.line('actor', line.actorName)
    }
  }
  context.heading(context.label('approvals'))
  if (snapshot.approvals.length === 0) context.paragraph(context.label('missing'))
  for (const approval of [...snapshot.approvals].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    context.paragraph(`${approval.createdAt}: ${approval.subject} / ${approval.decision} (${approval.id})`)
    context.line('actor', approval.actorName)
    context.line('method', approval.method)
    for (const change of approval.changes) context.line('changes', JSON.stringify(change))
  }
  context.heading(context.label('replies'))
  if (snapshot.replies.length === 0) context.paragraph(context.label('noReply'))
  for (const reply of [...snapshot.replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    context.paragraph(`${reply.createdAt}: ${reply.decision} (${reply.id})`)
    context.line('comment', reply.comment)
    context.line('attached', reply.addedPhotoIds.join(', '))
  }
}

// The advocates' transcript (extensions.md section 9.7): every move with its line amounts, grounds and the records they
// cite, and whether the chain of fingerprints still verifies. Neither side's limits are in the record to show.
export function renderTranscript(context: EvidenceDocument, snapshot: EvidenceSnapshot) {
  const { negotiation } = snapshot
  if (negotiation === null) return
  const amount = (cents: number) => formatMoney({ cents, currency: snapshot.rental.currency }, snapshot.rental.language)
  context.heading(context.label('transcript'))
  context.line('negotiation', `${negotiation.kind} / ${negotiation.state} (${negotiation.id})`)
  if (negotiation.simulated) context.paragraph(context.label('simulated'))
  if (negotiation.agreedCents !== null) context.line('agreed', amount(negotiation.agreedCents))
  if (negotiation.endedReason !== null) context.line('ended', negotiation.endedReason)
  for (const move of negotiation.moves) {
    context.room(80)
    context.paragraph(`${context.label('move')} ${String(move.sequence)}: ${move.side} / ${move.kind}${move.totalCents === null ? '' : ` / ${amount(move.totalCents)}`}${move.passReason === null ? '' : ` / ${move.passReason}`} / ${move.createdAt}`)
    for (const line of move.lines) context.paragraph(`${line.lineId}: ${amount(line.cents)}${line.ground === null ? '' : ` / ${line.ground}`}${line.evidence.length === 0 ? '' : ` / ${line.evidence.join(', ')}`}`)
    context.line('actor', move.actor)
    if (move.model !== null) context.line('model', move.model)
    if (move.promptVersion !== null) context.line('prompt', move.promptVersion)
    context.line('moveFingerprint', move.fingerprint)
    context.line('previousMove', move.previousFingerprint)
  }
  const chain = verifyTranscript(negotiation.moves.map((move) => ({ ...move, createdAt: new Date(move.createdAt) })))
  context.paragraph(chain.ok ? context.label('chainVerified') : `${context.label('chainBroken')} ${String(chain.sequence)}`)
}

export function renderPayments(context: EvidenceDocument, snapshot: EvidenceSnapshot) {
  const amount = (cents: number, currency: string) => formatMoney({ cents, currency }, snapshot.rental.language)
  context.heading(context.label('payments'))
  if (snapshot.paypalMode === 'sandbox') context.paragraph(context.label('sandbox'))
  for (const authorization of snapshot.authorizations) {
    context.line('authorization', `${authorization.reference}: ${authorization.state} / ${amount(authorization.amountCents, authorization.currency)}`)
    context.line('created', authorization.createdAt)
    context.line('expiry', authorization.validUntil)
  }
  if (snapshot.payments.length === 0) context.paragraph(context.label('noPayment'))
  for (const payment of snapshot.payments) context.paragraph(`${payment.kind}: ${amount(payment.amountCents, payment.currency)} / ${payment.paypalReference} / ${payment.occurredAt} (${payment.id})`)
  for (const invoice of snapshot.invoices) context.line('invoice', `${invoice.paypalInvoiceId ?? invoice.id}: ${invoice.state} / ${amount(invoice.amountCents, invoice.currency)}`)
}

export function renderFingerprints(context: EvidenceDocument, snapshot: EvidenceSnapshot, hashes: ReadonlyMap<string, string>) {
  context.heading(context.label('manifest'))
  for (const item of snapshot.items) for (const session of item.sessions) {
    context.line('item', `${item.label} / ${item.id}`)
    context.line('session', `${session.kind} / ${session.id}`)
    context.line('sealed', session.sealedAt)
    context.line('fingerprint', session.manifestFingerprint)
    context.line('previous', session.previousManifestFingerprint)
    for (const photo of session.photos) {
      context.line('view', `${photo.view} / ${photo.id}`)
      context.line('received', photo.receivedAt)
      context.line('original', photo.sha256)
      context.line('display', hashes.get(photo.id))
      if (photo.simulated) context.paragraph(context.label('simulated'))
      if (photo.supersededAt !== null) context.line('superseded', photo.supersededAt)
    }
  }
}
