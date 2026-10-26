import type { Transitions } from './state-machine.ts'

// Extension 4: an advocate for each side (extensions.md section 9). The words every part of the negotiation shares.

export const NEGOTIATION_SIDES = ['shop', 'renter'] as const
export type NegotiationSide = (typeof NEGOTIATION_SIDES)[number]
export const otherSide = (side: NegotiationSide): NegotiationSide => (side === 'shop' ? 'renter' : 'shop')

// What a lowered or waived line may rest on (section 9.6). evidence_stands keeps a line; goodwill rests on nothing.
export const GROUNDS = ['known_mark', 'ordinary_wear', 'uncertain_evidence', 'renter_photo', 'evidence_stands', 'goodwill'] as const
export type Ground = (typeof GROUNDS)[number]

// An advocate has exactly these three moves.
export const MOVE_KINDS = ['offer', 'accept', 'pass'] as const
export type MoveKind = (typeof MOVE_KINDS)[number]

// negotiation: both sides have an advocate. reply: only the renter has one, and it writes their contest (section 9.10).
export const NEGOTIATION_KINDS = ['negotiation', 'reply'] as const
export type NegotiationKind = (typeof NEGOTIATION_KINDS)[number]

// open: the advocates are exchanging offers. agreed: one accepted the other's offer, and people may still confirm.
// settled: everyone who had to confirm did, and the claim went on to be charged. escalated: the owner decides.
// replied: the renter's advocate wrote their contest. Nothing moves backwards, and nothing leaves an ending.
export const NEGOTIATION_STATES = ['open', 'agreed', 'settled', 'escalated', 'replied'] as const
export type NegotiationState = (typeof NEGOTIATION_STATES)[number]
export const NEGOTIATION_TRANSITIONS: Transitions<NegotiationState> = {
  open: ['agreed', 'escalated', 'replied'],
  agreed: ['settled', 'escalated'],
  settled: [],
  escalated: [],
  replied: [],
}

// Why a negotiation went to the owner. Recorded on the negotiation and shown to both people.
export const ESCALATION_REASONS = ['pass', 'refused_twice', 'time_limit', 'deadline', 'mandate_ended', 'declined', 'nothing_to_charge'] as const
export type EscalationReason = (typeof ESCALATION_REASONS)[number]

// Why a pass was made: the advocate chose it, or it could not move (the model was unavailable or refused, or a
// ceiling on calls, tokens or time was reached).
export const PASS_REASONS = ['chose', 'unavailable', 'ceiling'] as const
export type PassReason = (typeof PASS_REASONS)[number]

export const NEGOTIATION_LIMITS = {
  // How near a known mark must be to a finding's region, as a share of the photograph, for known_mark to hold.
  knownMarkDistance: 0.05,
  // An alignment below this, though good enough to compare, leaves the photographs open to doubt.
  goodAlignment: 0.96,
  // How long each side has for each move.
  turnMilliseconds: 10 * 60_000,
  // Refusals in a row after which a side passes.
  refusalsBeforePass: 2,
  // The negotiation ends this long before the earlier of the reply period's end and the hold's validity.
  deadlineMarginMilliseconds: 24 * 3_600_000,
  // An advocate's written argument, and the records one line may cite.
  argumentLength: 600,
  evidencePerLine: 5,
} as const

// The negotiation's deadline (section 9.9): the earlier of the reply period's end and the hold's validity, less a margin.
export function negotiationDeadline(replyDueAt: Date, holdValidUntil: Date): Date {
  return new Date(Math.min(replyDueAt.getTime(), holdValidUntil.getTime()) - NEGOTIATION_LIMITS.deadlineMarginMilliseconds)
}
