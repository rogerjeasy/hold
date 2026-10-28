import { briefFor, negotiationEvidence, negotiationRecords, submitAssistantMove } from '@hold/db'
import type { AssistantGrant, NegotiationRecords, RenterLimits } from '@hold/db'
import type { AgentActor, Offer, OfferLine } from '@hold/domain'
import type { ToolInput, ToolOutput } from './catalogue.ts'
import { inShopOf } from './ports.ts'
import type { Caller, Handled } from './public-tools.ts'
import type { RentalSubject } from './rental-tools.ts'

// The tools of a renter's own assistant acting as their advocate (extensions.md section 9.11), on the one claim the
// renter handed to it. They read what Hold's renter-side advocate reads, from the same records and the same brief, and
// move through the same gateway and referee. The shop's limits are never read here: the brief is built for the
// renter's side alone.

const ok = <Output>(output: Output): Handled<Output> => ({ ok: true, output })
const refused = (reason: string): Handled<never> => ({ ok: false, reason })
const words = (text: string) => ({ merchant_words: text })

type Scoped = RentalSubject & { readonly grant: AssistantGrant }

const lineOut = (line: OfferLine) => ({ line_id: line.lineId, cents: line.cents, ground: line.ground, evidence: [...line.evidence] })

async function records(caller: Caller, subject: Scoped): Promise<NegotiationRecords | undefined> {
  return inShopOf(caller.ports, subject.shopId, (transaction) => negotiationRecords(transaction, subject.grant.negotiationId))
}

async function evidence(caller: Caller, subject: Scoped) {
  return inShopOf(caller.ports, subject.shopId, (transaction) => negotiationEvidence(transaction, subject.grant.negotiationId))
}

export async function getNegotiation(caller: Caller, subject: Scoped): Promise<Handled<ToolOutput<'get_negotiation'>>> {
  const found = await records(caller, subject)
  if (found === undefined) return refused('not_found')
  const brief = briefFor(found, 'renter')
  const amount = (cents: number) => ({ cents, currency: brief.currency })
  const offer = (each: Offer | null) => (each === null ? null : { total: amount(each.totalCents), lines: each.lines.map(lineOut) })
  const limits = brief.yourLimits as RenterLimits
  return ok({
    rental_id: subject.rentalId,
    kind: brief.kind,
    state: found.negotiation.state,
    your_turn: brief.yourTurn,
    deadline: brief.deadline,
    claim_total: amount(brief.claim.totalCents),
    your_limit: { highest_total: amount(limits.highestTotalCents) },
    offers_left: { you: brief.offersLeft.you, other_side: brief.offersLeft.otherSide },
    lines: brief.claim.lines.map((line) => ({ line_id: line.lineId, description: words(line.description), reason: words(line.reason), published: amount(line.publishedCents), evidence: { known_mark_ids: [...line.evidence.knownMarkIds], in_doubt: line.evidence.inDoubt, both_looks_confirmed: line.evidence.bothLooksConfirmed } })),
    wear_policy_clauses: brief.wearPolicyClauses.map((clause) => ({ id: clause.id, text: words(clause.text) })),
    renter_photo_ids: [...brief.renterPhotoIds],
    last_offers: { yours: offer(brief.lastOffers.yours), theirs: offer(brief.lastOffers.theirs) },
    transcript: brief.transcript.map((move) => ({ sequence: move.sequence, by: move.by === 'you' ? 'you' as const : 'other_side' as const, kind: move.kind, total: move.totalCents === null ? null : amount(move.totalCents), lines: move.lines.map(lineOut) })),
    renter_comments: [...brief.renterComments],
  })
}

export async function getClaimLines(caller: Caller, subject: Scoped): Promise<Handled<ToolOutput<'get_claim_lines'>>> {
  const found = await evidence(caller, subject)
  if (found === undefined) return refused('not_found')
  return ok({
    rental_id: subject.rentalId,
    lines: found.lines.map((line) => ({
      line_id: line.lineId,
      description: words(line.description),
      reason: words(line.reason),
      published: { cents: line.publishedCents, currency: found.currency },
      finding: line.finding === null ? null : { view: line.finding.view, class: line.finding.findingClass, confidence: line.finding.confidence, description: words(line.finding.description), second_look_confirmed: line.finding.secondLookConfirmed, region: { ...line.finding.region }, alignment: line.finding.alignment },
    })),
  })
}

export async function getLinePhotos(caller: Caller, subject: Scoped, input: ToolInput<'get_line_photos'>): Promise<Handled<ToolOutput<'get_line_photos'>>> {
  const line = (await evidence(caller, subject))?.lines.find((each) => each.lineId === input.line_id)
  if (line === undefined) return refused('line_not_found')
  const link = (key: string | null) => (key === null ? Promise.resolve(null) : caller.ports.photoLink(key))
  return ok({ rental_id: subject.rentalId, line_id: line.lineId, view: line.photos.view, handover_photo_url: await link(line.photos.handoverKey), return_photo_url: await link(line.photos.returnKey) })
}

export async function getPriceList(caller: Caller, subject: Scoped): Promise<Handled<ToolOutput<'get_price_list'>>> {
  const found = await evidence(caller, subject)
  if (found === undefined) return refused('not_found')
  return ok({
    rental_id: subject.rentalId,
    price_list_version: found.priceList.version,
    wear_policy_version: found.wearPolicy.version,
    prices: found.priceList.entries.map((entry) => ({ code: entry.code, category: entry.category, description: words(entry.description), amount: { cents: entry.cents, currency: found.currency } })),
    wear_policy_clauses: found.wearPolicy.clauses.map((clause) => ({ id: clause.id, text: words(clause.text) })),
  })
}

export async function getKnownMarks(caller: Caller, subject: Scoped): Promise<Handled<ToolOutput<'get_known_marks'>>> {
  const found = await evidence(caller, subject)
  if (found === undefined) return refused('not_found')
  return ok({ rental_id: subject.rentalId, marks: found.knownMarks.map((mark) => ({ mark_id: mark.markId, view: mark.view, description: words(mark.description), region: { ...mark.region } })) })
}

// What happens next, from where the negotiation stands after the move.
function nextStep(found: NegotiationRecords | undefined): ToolOutput<'submit_offer'>['next'] {
  switch (found?.negotiation.state) {
    case 'open':
      return briefFor(found, 'renter').yourTurn ? 'your_move' : 'wait_for_the_shop'
    case 'agreed':
      return 'the_person_confirms_on_their_rental_link'
    case 'escalated':
    case 'replied':
      return 'the_owner_decides'
    default:
      return 'nothing'
  }
}

const GATEWAY_ANSWERS: Readonly<Record<string, string>> = { rate: 'rate_limited', arguments: 'invalid_arguments', mandate: 'mandate_ended' }

export async function submitOffer(caller: Caller, subject: Scoped, actor: AgentActor, input: ToolInput<'submit_offer'>): Promise<Handled<ToolOutput<'submit_offer'>>> {
  const lines = input.lines?.map((line) => ({ lineId: line.line_id, cents: line.cents, ground: line.ground, evidence: line.evidence }))
  // An offer names every line; accepting and passing name none, and any lines sent with them are the wrong shape.
  const args = input.move === 'offer' || lines !== undefined ? { lines: lines ?? [] } : {}
  const moved = await inShopOf(caller.ports, subject.shopId, (transaction) => submitAssistantMove(transaction, { sessionId: subject.sessionId, actor, tool: input.move, arguments: args }, caller.ports.now()))
  if (!moved.ok) return refused('not_authorized')
  const { result } = moved
  if (result.outcome === 'gateway_refused') return refused(GATEWAY_ANSWERS[result.reason] ?? 'not_authorized')
  if (moved.outboxId !== null) {
    try {
      await caller.ports.sendNegotiation({ shopId: subject.shopId, rentalId: subject.rentalId, negotiationId: moved.negotiationId, outboxId: moved.outboxId })
    } catch {
      // The committed outbox row is sent by the relay.
    }
  }
  const after = await records(caller, subject)
  return ok({ rental_id: subject.rentalId, outcome: result.outcome, reason: result.outcome === 'accepted' ? null : result.reason, state: after?.negotiation.state ?? null, next: nextStep(after) })
}
