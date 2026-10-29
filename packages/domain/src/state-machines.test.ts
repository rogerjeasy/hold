import { describe, expect, it } from 'vitest'
import { CLAIM_STATES, CLAIM_TRANSITIONS } from './claim.ts'
import { EXTENSION_STATES, EXTENSION_TRANSITIONS } from './extension.ts'
import { HOLD_STATES, HOLD_TRANSITIONS } from './hold.ts'
import { INCIDENT_STATES, INCIDENT_TRANSITIONS } from './incident.ts'
import { mayCapture, mayCloseRental, mayHandOver } from './lifecycle-links.ts'
import { NEGOTIATION_STATES, NEGOTIATION_TRANSITIONS } from './negotiation.ts'
import { RENTAL_STATES, RENTAL_TRANSITIONS } from './rental.ts'
import { isFinal, transition } from './state-machine.ts'
import type { Transitions } from './state-machine.ts'

const MACHINES = [
  { name: 'rental', states: RENTAL_STATES, transitions: RENTAL_TRANSITIONS as Transitions<string>, start: 'pending_payment', finals: ['closed', 'cancelled', 'abandoned'] },
  { name: 'hold', states: HOLD_STATES, transitions: HOLD_TRANSITIONS as Transitions<string>, start: 'requested', finals: ['released', 'captured', 'invoiced', 'expired', 'declined'] },
  { name: 'claim', states: CLAIM_STATES, transitions: CLAIM_TRANSITIONS as Transitions<string>, start: 'draft', finals: ['closed'] },
  { name: 'incident', states: INCIDENT_STATES, transitions: INCIDENT_TRANSITIONS as Transitions<string>, start: 'reported', finals: ['resolved', 'withdrawn'] },
  { name: 'extension', states: EXTENSION_STATES, transitions: EXTENSION_TRANSITIONS as Transitions<string>, start: 'quoted', finals: ['paid', 'failed', 'replaced'] },
  { name: 'negotiation', states: NEGOTIATION_STATES, transitions: NEGOTIATION_TRANSITIONS as Transitions<string>, start: 'open', finals: ['settled', 'escalated', 'replied'] },
] as const

function reachableFrom(transitions: Transitions<string>, start: string): Set<string> {
  const seen = new Set([start])
  const queue = [start]
  for (let state = queue.shift(); state !== undefined; state = queue.shift()) {
    for (const next of transitions[state] ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

describe.each(MACHINES)('the $name machine', ({ states, transitions, start, finals }) => {
  it('allows exactly the listed moves', () => {
    for (const from of states) {
      for (const to of states) {
        const allowed = transitions[from]?.includes(to) ?? false
        expect(transition(transitions, from, to)).toEqual(
          allowed ? { ok: true, value: to } : { ok: false, error: { kind: 'transition_not_allowed', from, to } },
        )
      }
    }
  })

  it('reaches every state from its start', () => {
    expect([...reachableFrom(transitions, start)].sort()).toEqual([...states].sort())
  })

  it('ends only in its final states', () => {
    expect(states.filter((state) => isFinal(transitions, state)).sort()).toEqual([...finals].sort())
  })

  it('can reach a final state from every state', () => {
    for (const state of states) {
      expect(finals.some((final) => reachableFrom(transitions, state).has(final))).toBe(true)
    }
  })
})

describe('the claim machine', () => {
  it('negotiates only from contested, and only forward: agreed or escalated, then charging or the owner’s decision', () => {
    expect(CLAIM_STATES.filter((state) => CLAIM_TRANSITIONS[state].includes('negotiating'))).toEqual(['contested'])
    expect(CLAIM_TRANSITIONS.negotiating).toEqual(['agreed', 'escalated'])
    expect(CLAIM_TRANSITIONS.agreed).toEqual(['charging', 'escalated'])
    expect(CLAIM_TRANSITIONS.escalated).toEqual(['decided'])
  })

  it('never lets a claim that negotiated, agreed or escalated negotiate again (X4.7)', () => {
    for (const state of ['negotiating', 'agreed', 'escalated', 'decided'] as const) {
      expect(reachableFrom(CLAIM_TRANSITIONS, state).has('contested')).toBe(false)
      expect([...reachableFrom(CLAIM_TRANSITIONS, state)].filter((reached) => reached !== state).includes('negotiating')).toBe(false)
    }
  })

  it('sends a contested claim the shop did not decide by its promised date to the owner, and never back', () => {
    expect(CLAIM_TRANSITIONS.contested).toContain('escalated')
    expect(reachableFrom(CLAIM_TRANSITIONS, 'escalated').has('negotiating')).toBe(false)
  })

  it('never lets an escalated claim return to contested', () => {
    expect(reachableFrom(CLAIM_TRANSITIONS, 'escalated').has('contested')).toBe(false)
  })

  it('lists the approved pre-expiry exception alongside reply, lapse, agreement and decision paths', () => {
    const intoCharging = CLAIM_STATES.filter((state) => CLAIM_TRANSITIONS[state].includes('charging'))
    expect(intoCharging.sort()).toEqual(['accepted', 'agreed', 'charge_failed', 'decided', 'lapsed', 'presented'])
  })
})

describe('the rental machine', () => {
  it('lets a renter drop the item off while it is out or late, and only a person makes it returned (architecture.md section 6.13)', () => {
    expect(RENTAL_STATES.filter((state) => RENTAL_TRANSITIONS[state].includes('dropped_off')).sort()).toEqual(['out', 'overdue'])
    expect(RENTAL_TRANSITIONS.dropped_off).toEqual(['returned'])
  })
})

describe('the extension machine', () => {
  it('is paid only through its capture, and a newer quote replaces one not yet captured', () => {
    expect(EXTENSION_STATES.filter((state) => EXTENSION_TRANSITIONS[state].includes('paid'))).toEqual(['capturing'])
    expect(EXTENSION_STATES.filter((state) => EXTENSION_TRANSITIONS[state].includes('replaced')).sort()).toEqual(['ordered', 'quoted'])
  })
})

describe('the incident machine', () => {
  it('never returns to reported or triaged once a person or the renter decided', () => {
    for (const state of ['agreed', 'shop_matter', 'claim_opened', 'awaiting_staff'] as const) {
      expect(reachableFrom(INCIDENT_TRANSITIONS, state).has('triaged')).toBe(false)
      expect(reachableFrom(INCIDENT_TRANSITIONS, state).has('reported')).toBe(false)
    }
  })
})

describe('how the machines connect', () => {
  it('hands over only with a placed hold', () => {
    expect(HOLD_STATES.filter(mayHandOver)).toEqual(['placed'])
  })

  it('captures only from a claim in charging', () => {
    expect(CLAIM_STATES.filter(mayCapture)).toEqual(['charging'])
  })

  it('closes a rental only once its hold is released, captured, invoiced or expired', () => {
    expect(HOLD_STATES.filter(mayCloseRental).sort()).toEqual(['captured', 'expired', 'invoiced', 'released'])
  })
})

it('can waive a failed protective charge and release its unused authorization', () => {
  expect(CLAIM_TRANSITIONS.charge_failed).toContain('waived')
  expect(HOLD_TRANSITIONS.capture_failed).toContain('releasing')
  expect(HOLD_TRANSITIONS.releasing).toContain('expired')
})
