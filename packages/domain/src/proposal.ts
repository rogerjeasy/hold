import type { Transitions } from './state-machine.ts'

// What the operations agent, or any agent, may ask a person to approve (extensions.md section 4.3). A proposal names
// records, never amounts: the amount shown and the amount sent to PayPal are both read from the database.
export const PROPOSAL_KINDS = ['release_hold', 'request_replacement_hold', 'send_invoice', 'refund_part', 'respond_to_dispute', 'send_message', 'note'] as const
export type ProposalKind = (typeof PROPOSAL_KINDS)[number]

export const PROPOSAL_STATES = ['pending', 'approved', 'rejected', 'expired', 'superseded', 'executing', 'executed', 'failed'] as const
export type ProposalState = (typeof PROPOSAL_STATES)[number]

export const PROPOSAL_TRANSITIONS: Transitions<ProposalState> = {
  pending: ['approved', 'rejected', 'expired', 'superseded'],
  approved: ['executing', 'superseded'],
  executing: ['executed', 'failed'],
  failed: ['executing'],
  executed: [],
  rejected: [],
  expired: [],
  superseded: [],
}

// The calls approving each kind can lead to. There is no capture among them: a charge begins only from a claim.
export const PROPOSAL_EXECUTORS: Readonly<Record<ProposalKind, { readonly actions: readonly string[] }>> = {
  release_hold: { actions: ['release'] },
  request_replacement_hold: { actions: ['authorize'] },
  send_invoice: { actions: ['invoice'] },
  refund_part: { actions: ['refund'] },
  respond_to_dispute: { actions: ['provide_dispute_evidence'] },
  send_message: { actions: ['email'] },
  note: { actions: [] },
}

const MONEY_KINDS: readonly ProposalKind[] = ['release_hold', 'request_replacement_hold', 'send_invoice', 'refund_part', 'respond_to_dispute']

// Anything that moves, returns or requests money, or speaks for the shop to PayPal, needs a person's approval.
export function proposalMovesMoney(kind: ProposalKind): boolean {
  return MONEY_KINDS.includes(kind)
}

// Several releases can be approved in one tap; nothing else can (section 6.3, step 5).
export function mayApproveTogether(kinds: readonly ProposalKind[]): boolean {
  return kinds.every((kind) => kind === 'release_hold')
}

// The state a proposal was written against, as one canonical string. At approval it is read again; if it changed,
// the proposal is superseded and nothing is executed.
export function proposalFingerprintInput(state: Readonly<Record<string, string | number | boolean | null>>): string {
  return JSON.stringify(Object.keys(state).sort().map((key) => [key, state[key] ?? null]))
}
