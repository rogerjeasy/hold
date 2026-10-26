import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { compareInspection } from './pipeline.ts'

const region = { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }
const damage = { region, class: 'new_damage', confidence: 0.96, description: 'New scratch on the frame', priceCode: 'scratch' }
const result = (findings: readonly unknown[] = []) => ({ sameItem: true, sameView: true, findings })
const reply = (data: unknown) => ({ kind: 'result' as const, model: 'recorded-model', data, inputTokens: 100, outputTokens: 50 })
async function input() {
  const image = await sharp({ create: { width: 640, height: 480, channels: 3, background: 'grey' } }).jpeg().toBuffer()
  return { views: [{ view: 'left-side', pair: { ok: true as const, before: image, after: image, candidates: [region], alignment: 0.99, offset: { x: 0, y: 0 } } }], marks: [], wearPolicy: 'Scuffs are wear', itemType: 'E-bike', priceCodes: ['scratch'] }
}

describe('the return comparison pipeline', () => {
  it('stops at ten calls and defers the unprocessed evidence', async () => {
    const given = await input()
    let calls = 0
    const compared = await compareInspection({ ...given, views: Array.from({ length: 6 }, (_, index) => ({ ...given.views[0], view: `view-${String(index)}` })).filter((view): view is typeof given.views[number] => view.pair !== undefined) }, { look: () => { calls += 1; return Promise.resolve(reply(result([damage]))) } })
    expect(calls).toBe(10)
    expect(compared.state).toBe('deferred')
  })
  it('reports clean only after a valid model result on every view', async () => {
    expect(await compareInspection(await input(), { look: () => Promise.resolve(reply(result())) })).toMatchObject({ state: 'clean', findings: [], model: 'recorded-model' })
  })
  it('checks damage in a fresh call that contains crops and none of the first look’s reasoning', async () => {
    const requests: unknown[] = []
    const compared = await compareInspection(await input(), { look: (request) => { requests.push(request); return Promise.resolve(reply(result([damage]))) } })
    expect(compared).toMatchObject({ state: 'findings', findings: [{ class: 'new_damage', secondLookConfirmed: true, priceCode: 'scratch' }] })
    expect(requests).toHaveLength(2)
    expect(JSON.stringify(requests[1])).not.toContain('New scratch on the frame')
    expect(JSON.stringify(requests[1])).not.toContain('scratch')
  })
  it('defers disagreement, refusal and malformed or invented money output', async () => {
    let calls = 0
    expect(await compareInspection(await input(), { look: () => Promise.resolve(reply(result(calls++ === 0 ? [damage] : []))) })).toMatchObject({ state: 'deferred' })
    expect(await compareInspection(await input(), { look: () => Promise.resolve({ kind: 'refused', model: 'recorded-model' }) })).toMatchObject({ state: 'deferred' })
    expect(await compareInspection(await input(), { look: () => Promise.resolve(reply(result([{ ...damage, amount: 999 }]))) })).toMatchObject({ state: 'deferred' })
  })
  it('defers a second look that contains uncertainty alongside confident damage', async () => {
    let calls = 0
    expect(await compareInspection(await input(), { look: () => Promise.resolve(reply(result(calls++ === 0 ? [damage] : [damage, { ...damage, class: 'uncertain' }]))) })).toMatchObject({ state: 'deferred', findings: [{ secondLookConfirmed: false }] })
  })
  it('matches known marks in return coordinates after accepted camera translation', async () => {
    const given = await input()
    const pair = given.views[0]?.pair
    if (pair === undefined) throw new Error('No prepared pair')
    const previous = { x: 0.2, y: 0.2, width: 0.1, height: 0.1 }
    expect(await compareInspection({ ...given, views: [{ view: 'left-side', pair: { ...pair, offset: { x: 0.05, y: 0 } } }], marks: [{ id: 'known', view: 'left-side', region: previous }] }, { look: () => Promise.resolve(reply(result([{ ...damage, region: { ...previous, x: 0.25 } }]))) })).toMatchObject({ state: 'clean', findings: [{ class: 'known_mark', matchedMarkId: 'known' }] })
  })
  it('labels damage the renter reported and agreed during the rental as reported, in return coordinates (X5.2)', async () => {
    const given = await input()
    const pair = given.views[0]?.pair
    if (pair === undefined) throw new Error('No prepared pair')
    const reported = [{ id: 'reported', view: 'left-side', region: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }, covered: true }]
    expect(await compareInspection({ ...given, views: [{ view: 'left-side', pair: { ...pair, offset: { x: 0.05, y: 0 } } }], reported }, { look: () => Promise.resolve(reply(result([{ ...damage, region: { ...region, x: 0.25 } }]))) })).toMatchObject({ state: 'clean', findings: [{ class: 'reported', matchedMarkId: 'reported' }] })
    expect(await compareInspection({ ...given, reported }, { look: () => Promise.resolve(reply(result([{ ...damage, region: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 } }]))) })).toMatchObject({ state: 'deferred', findings: [{ class: 'uncertain', matchedMarkId: 'reported' }] })
  })
  it('excludes known marks with code and discards an unknown price code', async () => {
    const given = await input()
    expect(await compareInspection({ ...given, marks: [{ id: 'known', view: 'left-side', region }] }, { look: () => Promise.resolve(reply(result([damage]))) })).toMatchObject({ state: 'clean', findings: [{ class: 'known_mark', matchedMarkId: 'known' }] })
    expect(await compareInspection(given, { look: () => Promise.resolve(reply(result([{ ...damage, priceCode: 'invented' }]))) })).toMatchObject({ findings: [{ priceCode: null }] })
  })
  it('defers a poor photograph or item mismatch and never silently drops a view', async () => {
    const given = await input()
    expect(await compareInspection({ ...given, views: [{ view: 'left-side', pair: { ok: false, reason: 'quality' } }] }, { look: () => { throw new Error('Must not call model') } })).toMatchObject({ state: 'deferred' })
    expect(await compareInspection(given, { look: () => Promise.resolve(reply({ ...result(), sameItem: false })) })).toMatchObject({ state: 'deferred' })
    expect(await compareInspection({ ...given, views: [] }, { look: () => { throw new Error('Must not call model') } })).toMatchObject({ state: 'deferred' })
  })
})
