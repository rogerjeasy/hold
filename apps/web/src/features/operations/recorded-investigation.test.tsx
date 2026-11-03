import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { recordedInvestigation } from './recorded-investigation'
import type { RecordedInvestigation } from './recorded-investigation'
import { RecordedInvestigationView } from './recorded-investigation-view'

const recording = {
  recordedAt: '2026-11-03T23:00:55.541Z',
  model: 'claude-opus-4-5-20251101',
  promptVersion: 'ops-1',
  toolCalls: 4,
  tokens: 13950,
  tools: ['paypal.get_order', 'paypal.get_dispute'],
  entries: [
    { kind: 'request_replacement_hold', exceptionKind: 'hold_ending', reason: 'The hold expires on 6 November; ask for a replacement.', references: ['SIMULATED-1-authorization'], draft: null },
    { kind: 'respond_to_dispute', exceptionKind: 'dispute_open', reason: 'Answer the dispute with the evidence pack.', references: [], draft: 'The renter saw both photographs.' },
  ],
}

function parsed(contents: unknown): RecordedInvestigation {
  const run = recordedInvestigation(contents)
  if (run === undefined) throw new Error('The recording did not read.')
  return run
}

describe('a recorded investigation of the operations agent', () => {
  it('reads only a recording whose entries are proposals of a kind that exists, never a charge', () => {
    expect(recordedInvestigation({ recording })).toBeDefined()
    expect(recordedInvestigation({ recording: null })).toBeUndefined()
    expect(recordedInvestigation({ recording: { ...recording, entries: [{ ...recording.entries[0], kind: 'capture' }] } })).toBeUndefined()
    expect(recordedInvestigation({ recording: { ...recording, tools: ['paypal.capture_authorization'] } })).toBeUndefined()
  })

  it('shows what code found, what the agent proposed and why, and that PayPal was only read, simulated for a sample', () => {
    renderWithIntl(<RecordedInvestigationView run={parsed({ recording })} />)
    expect(screen.getByText(/claude-opus-4-5-20251101 investigated the demonstration's sample queue on November 3, 2026/)).toBeInTheDocument()
    const first = within(screen.getByRole('article', { name: 'Ask the renter for a new hold' }))
    expect(first.getByText('The hold ends within three days and the rental is still open.')).toBeInTheDocument()
    expect(first.getByText('The hold expires on 6 November; ask for a replacement.')).toBeInTheDocument()
    expect(first.getByText('SIMULATED-1-authorization')).toBeInTheDocument()
    const second = within(screen.getByRole('article', { name: 'Send this answer to PayPal on the dispute' }))
    expect(second.getByText('The renter saw both photographs.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'PayPal tools it called, all read-only' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['get_order', 'get_dispute'])
  })
})
