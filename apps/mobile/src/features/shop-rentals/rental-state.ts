// Where a rental stands, in the web's words (rentalStates), and the tone its pill repeats. The word carries the
// meaning; the colour only repeats it.
type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive';

const STATES = {
  pending_payment: 'neutral',
  booked: 'neutral',
  awaiting_hold: 'warning',
  ready: 'primary',
  out: 'neutral',
  overdue: 'destructive',
  dropped_off: 'warning',
  returned: 'warning',
  inspecting: 'warning',
  settling: 'warning',
  closed: 'success',
  cancelled: 'neutral',
  abandoned: 'neutral',
  lapsed: 'neutral',
} as const satisfies Record<string, Tone>;

export type KnownState = keyof typeof STATES;

const isKnown = (state: string): state is KnownState => Object.hasOwn(STATES, state);

export function rentalState(state: string): { readonly key: KnownState | 'other'; readonly tone: Tone } {
  return isKnown(state) ? { key: state, tone: STATES[state] } : { key: 'other', tone: 'neutral' };
}

// A rental the counter still works on: not finished, and not a sample, which photographs and charges nothing.
export const isLive = (rental: { readonly state: string; readonly simulated: boolean }) => !['closed', 'cancelled', 'abandoned'].includes(rental.state) && !rental.simulated;
