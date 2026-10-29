import { claimWorkspace, conditionReport, evidenceVersions, quoteExtension, rentalHold, renterView, saveDraftReply } from '@hold/db'
import { atShopTime } from '@hold/domain'
import type { ToolInput, ToolOutput } from './catalogue.ts'
import { inShopOf } from './ports.ts'
import type { Caller, Handled } from './public-tools.ts'

// The tools open to the assistant of the renter who paid, on the one rental its agent token names (extensions.md
// section 8.3). Each reads inside the rental's shop. None moves money: the hold is approved in PayPal by the person, and
// accepting or contesting a claim is the person's to do.

export type RentalSubject = { readonly shopId: string; readonly rentalId: string; readonly sessionId: string }

const ok = <Output>(output: Output): Handled<Output> => ({ ok: true, output })
const refused = (reason: string): Handled<never> => ({ ok: false, reason })
const words = (text: string) => ({ merchant_words: text })
const amountOf = (cents: number, currency: string) => ({ cents, currency })
const iso = (date: Date | null) => (date === null ? null : date.toISOString())

// The claim states the renter is shown. A draft, or one waiting for a second person, is still the shop's own.
const UNPRESENTED = new Set(['draft', 'awaiting_approval'])

export async function getRental(caller: Caller, subject: RentalSubject): Promise<Handled<ToolOutput<'get_rental'>>> {
  const view = await inShopOf(caller.ports, subject.shopId, (transaction) => renterView(transaction, subject.rentalId, caller.ports.now()))
  if (view === undefined) return refused('not_found')
  return ok({
    rental_id: view.rentalId,
    shop_name: words(view.shopName),
    time_zone: view.timeZone,
    state: view.state,
    pick_up_from: view.startsAt.toISOString(),
    return_by: view.endsAt.toISOString(),
    items: view.lines.map((line) => ({ name: words(line.name), count: line.count })),
    fee: amountOf(view.feeCents, view.currency),
    hold: amountOf(view.holdCents, view.currency),
  })
}

export async function getHold(caller: Caller, subject: RentalSubject): Promise<Handled<ToolOutput<'get_hold'>>> {
  const loaded = await inShopOf(caller.ports, subject.shopId, async (transaction) => ({ hold: await rentalHold(transaction, subject.rentalId), view: await renterView(transaction, subject.rentalId, caller.ports.now()) }))
  if (loaded.view === undefined) return refused('not_found')
  const { hold, view } = loaded
  return ok({
    rental_id: subject.rentalId,
    state: hold?.state ?? 'not_requested',
    amount: hold === undefined ? null : amountOf(hold.reservedCents, hold.currency),
    agreed_at_booking: amountOf(view.holdCents, view.currency),
    assured_until: iso(hold?.assuredUntil ?? null),
    valid_until: iso(hold?.validUntil ?? null),
  })
}

export async function getHoldApprovalLink(caller: Caller, subject: RentalSubject): Promise<Handled<ToolOutput<'get_hold_approval_link'>>> {
  const approval = await caller.ports.holdApproval({ shopId: subject.shopId, rentalId: subject.rentalId })
  return ok({ rental_id: subject.rentalId, status: approval.status, approval_url: approval.status === 'awaiting_approval' ? approval.approvalUrl : null })
}

// More days for the person to approve in PayPal (architecture.md section 6.14). Hold prices them; the tool only returns
// the price and the link. It never captures, and the hold is never touched.
export async function requestExtension(caller: Caller, subject: RentalSubject, input: ToolInput<'request_extension'>): Promise<Handled<ToolOutput<'request_extension'>>> {
  const none = { extra_days: null, fee: null, return_by: null, approval_url: null, latest_return_by: null, needed_from: null, max_days: null }
  const now = caller.ports.now()
  const view = await inShopOf(caller.ports, subject.shopId, (transaction) => renterView(transaction, subject.rentalId, now))
  if (view === undefined) return refused('not_found')
  const endsAt = atShopTime(view.timeZone, input.ends_at)
  if (endsAt === undefined) return ok({ rental_id: subject.rentalId, status: 'refused', ...none, refused_because: 'not_later' })
  const quoted = await inShopOf(caller.ports, subject.shopId, (transaction) => quoteExtension(transaction, subject.rentalId, endsAt, 'assistant', now))
  if (!quoted.ok) {
    const { problem } = quoted
    if (problem.kind === 'not_found') return refused('not_found')
    return ok({
      rental_id: subject.rentalId,
      status: 'refused',
      ...none,
      refused_because: problem.kind,
      latest_return_by: problem.kind === 'beyond_hold' ? problem.latest.toISOString() : null,
      needed_from: problem.kind === 'not_free' ? problem.neededFrom.toISOString() : null,
      max_days: problem.kind === 'too_many_days' ? problem.maxDays : null,
    })
  }
  const payment = await caller.ports.extensionPayment({ shopId: subject.shopId, rentalId: subject.rentalId })
  if (!payment.ok) return ok({ rental_id: subject.rentalId, status: 'refused', ...none, refused_because: 'unavailable' })
  const { terms } = quoted
  return ok({ ...none, rental_id: subject.rentalId, status: 'awaiting_approval', extra_days: terms.extraDays, fee: amountOf(terms.fee.cents, terms.fee.currency), return_by: terms.endsAt.toISOString(), approval_url: payment.approvalUrl, refused_because: null })
}

export async function getConditionReport(caller: Caller, subject: RentalSubject): Promise<Handled<ToolOutput<'get_condition_report'>>> {
  const report = await inShopOf(caller.ports, subject.shopId, (transaction) => conditionReport(transaction, subject.rentalId, caller.ports.now()))
  if (report === undefined) return ok({ rental_id: subject.rentalId, handed_over: false, reply: 'none', items: [] })
  const link = (key: string | null) => (key === null ? Promise.resolve(null) : caller.ports.photoLink(key))
  return ok({
    rental_id: subject.rentalId,
    handed_over: true,
    reply: report.reply ?? 'none',
    items: await Promise.all(
      report.items.map(async (item) => ({
        label: words(item.label),
        photos: await Promise.all(item.photos.map(async (photo) => ({ view: photo.view, url: await link(photo.displayKey) }))),
        marks: item.marks.map((mark) => ({ view: mark.view, description: words(mark.description) })),
      })),
    ),
  })
}

export async function getClaim(caller: Caller, subject: RentalSubject): Promise<Handled<ToolOutput<'get_claim'>>> {
  const workspace = await inShopOf(caller.ports, subject.shopId, (transaction) => claimWorkspace(transaction, subject.rentalId))
  const claim = workspace?.claim ?? null
  if (workspace === undefined || claim === null || UNPRESENTED.has(claim.state)) {
    return ok({ rental_id: subject.rentalId, presented: false, state: null, total: null, reply_due_at: null, lines: [], from_hold: null, released: null, invoiced: null })
  }
  const { currency, amounts } = workspace
  const link = (key: string | null) => (key === null ? Promise.resolve(null) : caller.ports.photoLink(key))
  return ok({
    rental_id: subject.rentalId,
    presented: true,
    state: claim.state,
    total: amountOf(claim.totalCents, currency),
    reply_due_at: iso(claim.replyDueAt),
    lines: await Promise.all(
      workspace.lines.map(async (line) => ({
        description: words(line.description),
        reason: words(line.reason ?? line.findingDescription ?? line.incidentDescription ?? ''),
        amount: amountOf(line.amountCents, currency),
        before_photo_url: await link(line.beforeKey),
        after_photo_url: await link(line.afterKey),
      })),
    ),
    from_hold: amounts.capture,
    released: amounts.release,
    invoiced: amounts.invoice,
  })
}

export async function draftClaimReply(caller: Caller, subject: RentalSubject, input: ToolInput<'draft_claim_reply'>): Promise<Handled<ToolOutput<'draft_claim_reply'>>> {
  await inShopOf(caller.ports, subject.shopId, (transaction) => saveDraftReply(transaction, subject.sessionId, { decision: input.decision, comment: input.comment }, caller.ports.now()))
  return ok({ rental_id: subject.rentalId, saved: true })
}

// The person answers a claim on their own rental link, with the one-time code Hold emails them. The link given here
// opens no rental: it explains where to answer, so no assistant ever holds a link that could start the reply period.
export function claimNeedsThePerson(caller: Caller, subject: RentalSubject): ToolOutput<'submit_claim_reply'> {
  return { rental_id: subject.rentalId, status: 'human_confirmation_required', confirm_where: 'the_claim_page_of_the_renter_link_with_the_emailed_one_time_code', link: `${caller.ports.publicUrl}/for-renters` }
}

export async function getRecord(caller: Caller, subject: RentalSubject): Promise<Handled<ToolOutput<'get_record'>>> {
  const versions = await inShopOf(caller.ports, subject.shopId, (transaction) => evidenceVersions(transaction, subject.rentalId, true))
  return ok({
    rental_id: subject.rentalId,
    versions: versions.map((version) => ({ version: version.version, state: version.state, created_at: version.createdAt.toISOString(), pdf_sha256: version.pdfSha256, manifest_sha256: version.manifestFingerprint })),
  })
}
