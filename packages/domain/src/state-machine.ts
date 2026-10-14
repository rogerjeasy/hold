import { fail, ok } from './result.ts'
import type { Result } from './result.ts'

// Every state a machine can be in, mapped to the states it may move to next. A move that is not listed cannot happen.
export type Transitions<State extends string> = Readonly<Record<State, readonly State[]>>

export type TransitionRefused<State extends string> = {
  readonly kind: 'transition_not_allowed'
  readonly from: State
  readonly to: State
}

export function transition<State extends string>(
  transitions: Transitions<State>,
  from: State,
  to: State,
): Result<State, TransitionRefused<State>> {
  return transitions[from].includes(to) ? ok(to) : fail({ kind: 'transition_not_allowed', from, to })
}

export function isFinal<State extends string>(transitions: Transitions<State>, state: State): boolean {
  return transitions[state].length === 0
}
