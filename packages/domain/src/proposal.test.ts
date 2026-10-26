import { describe, expect, it } from 'vitest'
import { mayApproveTogether, PROPOSAL_EXECUTORS, PROPOSAL_KINDS, PROPOSAL_TRANSITIONS, proposalFingerprintInput, proposalMovesMoney } from './proposal.ts'
import { transition } from './state-machine.ts'

describe('proposals', () => {
  // X1.3: there is no proposal kind for a capture, and none can be added without failing here.
  it('leads to no capture, whatever its kind', () => {
    for (const kind of PROPOSAL_KINDS) expect(PROPOSAL_EXECUTORS[kind].actions).not.toContain('capture')
    expect(PROPOSAL_KINDS).toEqual(['release_hold', 'request_replacement_hold', 'send_invoice', 'refund_part', 'respond_to_dispute', 'send_message', 'note'])
  })

  it('names, for each kind, whether approving it moves, returns or requests money', () => {
    expect(PROPOSAL_KINDS.filter(proposalMovesMoney)).toEqual(['release_hold', 'request_replacement_hold', 'send_invoice', 'refund_part', 'respond_to_dispute'])
  })

  it('never moves backwards, and a stale proposal ends as superseded', () => {
    expect(transition(PROPOSAL_TRANSITIONS, 'pending', 'superseded').ok).toBe(true)
    expect(transition(PROPOSAL_TRANSITIONS, 'executed', 'pending').ok).toBe(false)
    expect(transition(PROPOSAL_TRANSITIONS, 'rejected', 'approved').ok).toBe(false)
    expect(transition(PROPOSAL_TRANSITIONS, 'failed', 'executing').ok).toBe(true)
  })

  it('lets several be approved together only when every one releases a hold', () => {
    expect(mayApproveTogether(['release_hold', 'release_hold'])).toBe(true)
    expect(mayApproveTogether(['release_hold', 'send_invoice'])).toBe(false)
    expect(mayApproveTogether(['release_hold'])).toBe(true)
  })

  it('names the state it was written against the same way however its fields arrive', () => {
    expect(proposalFingerprintInput({ holdState: 'placed', authorization: 'A1' })).toBe(proposalFingerprintInput({ authorization: 'A1', holdState: 'placed' }))
    expect(proposalFingerprintInput({ holdState: 'placed' })).not.toBe(proposalFingerprintInput({ holdState: 'released' }))
  })
})
