import { fail, ok } from './result.ts'
import type { Result } from './result.ts'
import type { Transitions } from './state-machine.ts'

// Repair closes the loop (architecture.md section 9.6): charged damage becomes a known mark and opens a repair; staff
// photograph the repaired views, say for each line whether it was repaired or left as is, and what it cost. No money
// moves: the cost is the shop's own record, in whole cents.

export const REPAIR_STATES = ['open', 'done'] as const
export type RepairState = (typeof REPAIR_STATES)[number]
export const REPAIR_TRANSITIONS: Transitions<RepairState> = { open: ['done'], done: [] }

export const REPAIR_OUTCOMES = ['repaired', 'left'] as const
export type RepairOutcome = (typeof REPAIR_OUTCOMES)[number]

export const REPAIR_LIMITS = { maxCostCents: 10_000_000, noteLength: 500 } as const

// The views to photograph: each view a marked line is on, once, in the order the lines name them.
export function repairViews(lines: readonly { readonly view: string | null }[]): string[] {
  return [...new Set(lines.flatMap((line) => (line.view === null ? [] : [line.view])))]
}

export type RepairClose = { readonly outcomes: Readonly<Record<string, RepairOutcome>>; readonly costCents: number; readonly note: string | null }
export type RepairCloseProblem = 'outcome_missing' | 'cost_invalid' | 'note_too_long'

// Every line has exactly one outcome and no other line is named; the cost is whole cents within reason.
export function checkRepairClose(input: { readonly lines: readonly { readonly id: string }[]; readonly outcomes: Readonly<Record<string, RepairOutcome>>; readonly costCents: number; readonly note: string }): Result<RepairClose, RepairCloseProblem> {
  const ids = input.lines.map((line) => line.id)
  if (Object.keys(input.outcomes).length !== ids.length || !ids.every((id) => input.outcomes[id] !== undefined)) return fail('outcome_missing')
  if (!Number.isSafeInteger(input.costCents) || input.costCents < 0 || input.costCents > REPAIR_LIMITS.maxCostCents) return fail('cost_invalid')
  const note = input.note.trim()
  if (note.length > REPAIR_LIMITS.noteLength) return fail('note_too_long')
  return ok({ outcomes: input.outcomes, costCents: input.costCents, note: note === '' ? null : note })
}

// Whether a published price covers what repairs of that damage cost on average, once one was costed.
export function priceRepairStanding(priceCents: number, costsCents: readonly number[]): { readonly repairs: number; readonly averageCents: number | null; readonly standing: 'covers' | 'below' | null } {
  if (costsCents.length === 0) return { repairs: 0, averageCents: null, standing: null }
  const averageCents = Math.round(costsCents.reduce((sum, cost) => sum + cost, 0) / costsCents.length)
  return { repairs: costsCents.length, averageCents, standing: averageCents <= priceCents ? 'covers' : 'below' }
}
