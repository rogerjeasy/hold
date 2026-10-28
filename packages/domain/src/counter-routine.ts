import type { CaptureSessionKind } from './capture-session.ts'

// How long the counter routine takes (project-description.md section 13): the median time from opening a handover or
// a return to sealing it, with how many sessions it rests on. A session with the demonstration's sample photographs is
// not a counter's, and one not yet sealed has no time. No count, no time: a kind with no session says nothing.

export type RoutineSession = { readonly kind: CaptureSessionKind; readonly startedAt: Date; readonly sealedAt: Date | null; readonly simulated: boolean }
export type RoutineTime = { readonly medianSeconds: number | null; readonly count: number }

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((first, second) => first - second)
  const middle = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 === 1 ? sorted[middle] : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
  return value === undefined ? null : Math.round(value)
}

function timeOf(sessions: readonly RoutineSession[], kind: 'handover' | 'return'): RoutineTime {
  const seconds = sessions.flatMap((session) => (session.kind === kind && !session.simulated && session.sealedAt !== null ? [(session.sealedAt.getTime() - session.startedAt.getTime()) / 1000] : []))
  return { medianSeconds: median(seconds), count: seconds.length }
}

export function counterRoutine(sessions: readonly RoutineSession[]): { readonly handover: RoutineTime; readonly return: RoutineTime } {
  return { handover: timeOf(sessions, 'handover'), return: timeOf(sessions, 'return') }
}
