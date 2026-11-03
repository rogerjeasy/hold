import { describe, expect, it } from 'vitest'
import recorded from '@/test/recorded-advocates-run.json'
import { recordedRun } from './recorded-run'

// The recorded live run shown on a sample claim when no live run is left (extensions.md section 9). It is read from a
// committed file, so it is checked like any outside data before it is shown.
describe('the recorded live run of the advocates', () => {
  it('is nothing until a run has been recorded', () => {
    expect(recordedRun({ recording: null })).toBeUndefined()
  })

  it('reads a recording with its model, prompt version, spend and transcript, dates as dates', () => {
    const run = recordedRun(recorded)
    expect(run).toMatchObject({ model: 'us.anthropic.claude-opus-4-6-v1', calls: 8, tokens: 27632, transcript: { state: 'agreed', agreedCents: 2500, sample: true, simulated: false } })
    expect(run?.recordedAt).toEqual(new Date('2026-11-03T07:49:10.000Z'))
    expect(run?.transcript.moves.map((move) => move.createdAt instanceof Date)).toEqual([true, true, true])
  })

  it('shows nothing rather than a recording that does not read as one', () => {
    expect(recordedRun({ recording: { ...recorded.recording, tokens: -1 } })).toBeUndefined()
    expect(recordedRun({ recording: { ...recorded.recording, transcript: { ...recorded.recording.transcript, state: 'won' } } })).toBeUndefined()
    // A run of the test environment's stand-ins is not a live run, whatever the file says.
    expect(recordedRun({ recording: { ...recorded.recording, transcript: { ...recorded.recording.transcript, simulated: true } } })).toBeUndefined()
  })
})
