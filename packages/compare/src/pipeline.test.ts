import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import type { LookRequest } from './model.ts'
import { compareInspection } from './pipeline.ts'

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const
// The return photograph taken a little to one side: a handover position lands 0.05 further right.
const SHIFTED = [1, 0, 0.05, 0, 1, 0, 0, 0, 1] as const

const region = { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }
const damage = { region, class: 'new_damage', confidence: 0.96, description: 'New scratch on the frame', priceCode: 'scratch' }
const result = (findings: readonly unknown[] = [], dismissed: readonly unknown[] = []) => ({ sameItem: true, sameView: true, findings, dismissed })
const reply = (data: unknown) => ({ kind: 'result' as const, model: 'recorded-model', data, inputTokens: 100, outputTokens: 50 })
async function input() {
  const image = await sharp({ create: { width: 640, height: 480, channels: 3, background: 'grey' } }).jpeg().toBuffer()
  return { views: [{ view: 'left-side', pair: { ok: true as const, before: image, after: image, alignedBefore: image, candidates: [region], alignment: 0.99, homography: IDENTITY } }], marks: [], wearPolicy: 'Scuffs are wear', itemType: 'E-bike', priceCodes: ['scratch'] }
}

describe('the return comparison pipeline', () => {
  it('stops at ten calls and defers the unprocessed evidence', async () => {
    const given = await input()
    let calls = 0
    const compared = await compareInspection({ ...given, views: Array.from({ length: 6 }, (_, index) => ({ ...given.views[0], view: `view-${String(index)}` })).filter((view): view is typeof given.views[number] => view.pair !== undefined) }, { look: () => { calls += 1; return Promise.resolve(reply(result([damage]))) } })
    expect(calls).toBe(10)
    expect(compared.state).toBe('deferred')
  })
  it('reports clean only after a valid model result on every view that accounts for each candidate', async () => {
    const dismissed = [{ candidate: 0, reason: 'shadow' }]
    expect(await compareInspection(await input(), { look: () => Promise.resolve(reply(result([], dismissed))) })).toMatchObject({ state: 'clean', findings: [], model: 'recorded-model' })
  })
  // Code finds the candidate areas, so the model may not pass over one in silence (AGENTS.md section 8).
  it('sends a candidate the model neither reported nor dismissed to a person, as an uncertain finding over it', async () => {
    const compared = await compareInspection(await input(), { look: () => Promise.resolve(reply(result())) })
    expect(compared).toMatchObject({ state: 'deferred', findings: [{ view: 'left-side', region, class: 'uncertain', confidence: 0, priceCode: null, secondLookConfirmed: null }] })
  })
  it('does not take a dismissal that names no candidate', async () => {
    const compared = await compareInspection(await input(), { look: () => Promise.resolve(reply(result([], [{ candidate: 3, reason: 'light' }]))) })
    expect(compared).toMatchObject({ state: 'deferred', findings: [{ class: 'uncertain', region }] })
  })
  it('records how many candidates code found, how many the model dismissed and how many went to a person', async () => {
    const given = await input()
    const pair = given.views[0]?.pair
    if (pair === undefined) throw new Error('No prepared pair')
    const elsewhere = { x: 0.7, y: 0.7, width: 0.1, height: 0.1 }
    const compared = await compareInspection({ ...given, views: [{ view: 'left-side', pair: { ...pair, candidates: [region, elsewhere] } }] }, { look: () => Promise.resolve(reply(result([], [{ candidate: 0, reason: 'reflection' }]))) })
    expect(compared.alignment).toMatchObject({ candidates: 2, dismissed: 1, unaccounted: 1 })
  })
  it('checks damage in a fresh call that contains crops and none of the first look’s reasoning', async () => {
    const requests: unknown[] = []
    const compared = await compareInspection(await input(), { look: (request) => { requests.push(request); return Promise.resolve(reply(result([damage]))) } })
    expect(compared).toMatchObject({ state: 'findings', findings: [{ class: 'new_damage', secondLookConfirmed: true, priceCode: 'scratch' }] })
    expect(requests).toHaveLength(2)
    expect(JSON.stringify(requests[1])).not.toContain('New scratch on the frame')
    expect(JSON.stringify(requests[1])).not.toContain('scratch')
  })
  // Measured on the demonstration's sample pair on 28 October 2026: on crops this tight the second look agreed on the
  // class every time but was unsure of a featureless tube twice in five runs; with more of the frame it confirmed 8 of 8.
  it('shows the second look more of the item around the finding than the first look’s crops', async () => {
    const requests: LookRequest[] = []
    await compareInspection(await input(), { look: (request) => { requests.push(request); return Promise.resolve(reply(result([damage]))) } })
    const widthOf = async (body: Buffer | undefined) => (await sharp(body).metadata()).width
    const firstCrop = requests[0]?.images.find((image) => image.label === 'Return crop')?.body
    const secondCrop = requests[1]?.images.find((image) => image.label === 'Return crop')?.body
    // The finding is a fifth of the photograph wide: a tenth more on each side makes the crop 0.4 of 640 pixels.
    expect(await widthOf(secondCrop)).toBe(256)
    expect(await widthOf(secondCrop)).toBeGreaterThan(await widthOf(firstCrop))
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
  it('matches known marks in return coordinates after an accepted camera move', async () => {
    const given = await input()
    const pair = given.views[0]?.pair
    if (pair === undefined) throw new Error('No prepared pair')
    const previous = { x: 0.2, y: 0.2, width: 0.1, height: 0.1 }
    expect(await compareInspection({ ...given, views: [{ view: 'left-side', pair: { ...pair, homography: SHIFTED } }], marks: [{ id: 'known', view: 'left-side', region: previous }] }, { look: () => Promise.resolve(reply(result([{ ...damage, region: { ...previous, x: 0.25 } }]))) })).toMatchObject({ state: 'clean', findings: [{ class: 'known_mark', matchedMarkId: 'known' }] })
  })
  it('carries a known mark through a turned camera to the box around where its corners land', async () => {
    const given = await input()
    const pair = given.views[0]?.pair
    if (pair === undefined) throw new Error('No prepared pair')
    // Turned 90 degrees about the photograph's centre: (x, y) lands at (1 - y, x).
    const turned = [0, -1, 1, 1, 0, 0, 0, 0, 1] as const
    const previous = { x: 0.2, y: 0.6, width: 0.1, height: 0.2 }
    const where = { x: 0.2, y: 0.2, width: 0.2, height: 0.1 }
    expect(await compareInspection({ ...given, views: [{ view: 'left-side', pair: { ...pair, homography: turned } }], marks: [{ id: 'known', view: 'left-side', region: previous }] }, { look: () => Promise.resolve(reply(result([{ ...damage, region: where }]))) })).toMatchObject({ state: 'clean', findings: [{ class: 'known_mark', matchedMarkId: 'known' }] })
  })
  it('cuts the handover crop from the handover lined up on the return photograph, at the same region', async () => {
    const given = await input()
    const pair = given.views[0]?.pair
    if (pair === undefined) throw new Error('No prepared pair')
    const white = await sharp({ create: { width: 640, height: 480, channels: 3, background: 'white' } }).jpeg().toBuffer()
    const requests: LookRequest[] = []
    await compareInspection({ ...given, views: [{ view: 'left-side', pair: { ...pair, alignedBefore: white, homography: SHIFTED } }] }, { look: (request) => { requests.push(request); return Promise.resolve(reply(result([damage]))) } })
    for (const request of requests) {
      const crop = request.images.find((image) => image.label === 'Handover crop')?.body
      const { channels } = await sharp(crop).stats()
      expect(channels[0]?.mean).toBeGreaterThan(250)
      const returned = request.images.find((image) => image.label === 'Return crop')?.body
      expect((await sharp(crop).metadata()).width).toBe((await sharp(returned).metadata()).width)
    }
    expect(requests).toHaveLength(2)
  })
  it('labels damage the renter reported and agreed during the rental as reported, in return coordinates (X5.2)', async () => {
    const given = await input()
    const pair = given.views[0]?.pair
    if (pair === undefined) throw new Error('No prepared pair')
    const reported = [{ id: 'reported', view: 'left-side', region: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }, covered: true }]
    expect(await compareInspection({ ...given, views: [{ view: 'left-side', pair: { ...pair, homography: SHIFTED } }], reported }, { look: () => Promise.resolve(reply(result([{ ...damage, region: { ...region, x: 0.25 } }]))) })).toMatchObject({ state: 'clean', findings: [{ class: 'reported', matchedMarkId: 'reported' }] })
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
