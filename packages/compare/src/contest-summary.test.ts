import type { ContestRecord } from '@hold/db'
import { describe, expect, it } from 'vitest'
import { CONTEST_PROMPT_VERSION } from './contest-model.ts'
import type { ContestModel } from './contest-model.ts'
import { createSimulatedContestModel, summarizeContest } from './contest-summary.ts'

const record: ContestRecord = {
  claimId: 'claim',
  lines: [
    { id: 'line-scratch', description: 'Scratch on the frame, through the paint', source: 'finding', findingDescription: 'A chip in the paint on the down tube.', bothLooksConfirmed: true, knownMarkNearby: true, addedBy: null, reason: 'A chip in the paint on the down tube.' },
    { id: 'line-light', description: 'Lost front light', source: 'person', findingDescription: null, bothLooksConfirmed: false, knownMarkNearby: false, addedBy: 'Jonas', reason: 'The light was missing at the return.' },
  ],
  comment: 'The scratch on the frame was already there when I picked it up.',
  renterPhotos: 0,
  conditionReply: 'confirmed',
  conditionRepliedAt: new Date('2026-11-01T09:14:00Z'),
  incidentsReported: 0,
  languages: { shop: 'pt', renter: 'en' },
}
const version = (overview: string) => ({
  overview,
  lines: [
    { lineId: 'line-scratch', disputed: true, renterSays: 'She says it was there at pickup.', renterQuote: 'The scratch on the frame was already there when I picked it up.' },
    { lineId: 'line-light', disputed: false, renterSays: null, renterQuote: null },
  ],
})
const answering = (data: unknown): ContestModel & { asked: string[] } => {
  const asked: string[] = []
  return { asked, summarize: (request) => { asked.push(request.quoted); return Promise.resolve({ kind: 'result', data, model: 'claude' }) } }
}

describe('writing a neutral summary of a contest', () => {
  it('asks the model once with the record as quoted data, naming no amount, and keeps a checked answer', async () => {
    const model = answering({ forShop: version('A renter disputes the scratch.'), forRenter: version('You dispute the scratch.') })
    const stored = await summarizeContest(record, model)
    expect(stored).toMatchObject({ outcome: 'answered', model: 'claude', promptVersion: CONTEST_PROMPT_VERSION, simulated: false })
    expect(stored.summary?.forShop.lines[0]).toMatchObject({ disputed: true, renterQuote: record.comment })
    expect(model.asked).toHaveLength(1)
    const quoted = JSON.parse(model.asked[0] ?? '{}') as Record<string, unknown>
    expect(quoted).toMatchObject({ renterWords: record.comment, readers: { shop: 'pt', renter: 'en' } })
    expect(model.asked[0]).not.toMatch(/\d{2,}/)
  })

  it('keeps nothing from an answer that names a number, has the wrong shape, or never came', async () => {
    expect(await summarizeContest(record, answering({ forShop: version('The renter disputes the €35 scratch.'), forRenter: version('You dispute the scratch.') }))).toMatchObject({ outcome: 'dropped', summary: null })
    expect(await summarizeContest(record, answering({ forShop: 'nothing' }))).toMatchObject({ outcome: 'invalid', summary: null })
    // The shop's side is shown from the record, so an answer that writes it for the shop is not kept.
    const speaksForShop = version('A renter disputes the scratch.')
    const withShopSide = { ...speaksForShop, lines: speaksForShop.lines.map((line) => ({ ...line, shopSays: 'The shop accepts it was there before.' })) }
    expect(await summarizeContest(record, answering({ forShop: withShopSide, forRenter: version('You dispute the scratch.') }))).toMatchObject({ outcome: 'invalid', summary: null })
    expect(await summarizeContest(record, { summarize: () => Promise.resolve({ kind: 'refused', model: 'claude' }) })).toMatchObject({ outcome: 'refused', summary: null })
    expect(await summarizeContest(record, { summarize: () => Promise.reject(new Error('down')) })).toMatchObject({ outcome: 'unavailable', summary: null, model: 'not_answered' })
    const slow: ContestModel = { summarize: (_request, signal) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => { reject(new Error('aborted')) }) }) }
    expect(await summarizeContest(record, slow, 10)).toMatchObject({ outcome: 'unavailable' })
  })

  it('has a stand-in for the test environment that says it is simulated in every record', async () => {
    const stored = await summarizeContest(record, createSimulatedContestModel())
    expect(stored).toMatchObject({ outcome: 'answered', simulated: true })
    expect(stored.summary?.forShop.lines.map((line) => line.lineId).sort()).toEqual(['line-light', 'line-scratch'])
  })
})
