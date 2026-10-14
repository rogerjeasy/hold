import type { Transitions } from './state-machine.ts'

export const HOLD_STATES = [
  'requested',
  'placed',
  'declined',
  'renewing',
  'at_risk',
  'releasing',
  'released',
  'capturing',
  'captured',
  'capture_failed',
  'invoiced',
  'expired',
] as const

export type HoldState = (typeof HOLD_STATES)[number]

// architecture.md section 7.1.
export const HOLD_TRANSITIONS: Transitions<HoldState> = {
  requested: ['placed', 'declined'],
  placed: ['renewing', 'releasing', 'capturing', 'expired'],
  renewing: ['placed', 'at_risk'],
  at_risk: ['placed', 'releasing', 'capturing', 'expired'],
  releasing: ['released'],
  capturing: ['captured', 'capture_failed'],
  capture_failed: ['capturing', 'invoiced'],
  released: [],
  captured: [],
  invoiced: [],
  expired: [],
  declined: [],
}
