import type { Transitions } from './state-machine.ts'

export const CLAIM_STATES = [
  'draft',
  'awaiting_approval',
  'approved',
  'presented',
  'accepted',
  'contested',
  'lapsed',
  'negotiating',
  'agreed',
  'escalated',
  'decided',
  'charging',
  'charged',
  'charge_failed',
  'adjusted',
  'waived',
  'closed',
] as const

export type ClaimState = (typeof CLAIM_STATES)[number]

// architecture.md section 7.1. An escalated claim never returns to contested. A contested claim the shop did not decide
// by the date it promised goes to the owner (section 6.16).
export const CLAIM_TRANSITIONS: Transitions<ClaimState> = {
  draft: ['awaiting_approval', 'waived'],
  awaiting_approval: ['approved', 'waived'],
  approved: ['presented'],
  presented: ['accepted', 'contested', 'lapsed', 'charging'],
  contested: ['negotiating', 'decided', 'escalated'],
  negotiating: ['agreed', 'escalated'],
  agreed: ['charging', 'escalated'],
  escalated: ['decided'],
  accepted: ['charging'],
  lapsed: ['charging'],
  decided: ['charging', 'waived'],
  charging: ['charged', 'charge_failed'],
  charge_failed: ['charging', 'waived'],
  charged: ['adjusted', 'closed'],
  adjusted: ['closed'],
  waived: ['closed'],
  closed: [],
}
