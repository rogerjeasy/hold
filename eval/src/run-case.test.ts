import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ComparisonModel, LookRequest } from '@hold/compare'
import { beforeAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { runCase } from './run-case.ts'
import type { EvaluationCase } from './manifest.ts'

const SAMPLE = join(import.meta.dirname, '../../apps/web/public/images/sample-handover.jpg')
let before: Buffer
let scratched: Buffer
beforeAll(async () => {
  before = await readFile(SAMPLE)
  // A dark stroke across the frame stands in for a scratch, at a known place.
  const { width, height } = await sharp(before).metadata()
  const stroke = Buffer.from(`<svg width="${String(width)}" height="${String(height)}"><line x1="${String(width * 0.42)}" y1="${String(height * 0.45)}" x2="${String(width * 0.5)}" y2="${String(height * 0.5)}" stroke="#101010" stroke-width="10"/></svg>`)
  scratched = await sharp(before).composite([{ input: stroke }]).jpeg({ quality: 92 }).toBuffer()
})

const context = { itemType: 'City e-bike', wearPolicy: 'Scuffs on tyres are wear.', priceCodes: ['scratch'] }
const pair = (overrides: Partial<EvaluationCase>): EvaluationCase => ({ id: 'case', half: 'gate', group: 'damage', origin: 'synthetic', view: 'frame-left', before: 'gate/before.jpg', after: 'gate/after.jpg', earlier: [], labels: [{ kind: 'damage', region: { x: 0.4, y: 0.42, width: 0.12, height: 0.1 } }], knownMarks: [], ...overrides })

// A recorded model: the first look reports a scratch where the label is, and the second look confirms it.
function recordedModel(): ComparisonModel & { readonly requests: LookRequest[] } {
  const requests: LookRequest[] = []
  const finding = { region: { x: 0.41, y: 0.43, width: 0.1, height: 0.08 }, class: 'new_damage', confidence: 0.96, description: 'A new dark scratch on the frame.', priceCode: 'scratch' }
  return {
    requests,
    look(request) {
      requests.push(request)
      return Promise.resolve({ kind: 'result', model: 'recorded-model', inputTokens: 1000, outputTokens: 100, data: { sameItem: true, sameView: true, findings: [request.kind === 'first' ? finding : { ...finding, priceCode: null }], dismissed: [] } })
    },
  }
}

const files = (after: () => Buffer) => ({ read: (path: string) => Promise.resolve(path.endsWith('after.jpg') ? after() : before) })
// Two different shots of one view never share a fingerprint; a copied photograph shares both.
const distinctShots = { fingerprint: (photo: Buffer) => Promise.resolve({ sha256: photo === before ? 'before' : 'after', perceptualHash: photo === before ? 'b' : 'a' }) }

describe('running one case of the evaluation set', () => {
  it('runs the real pipeline on the pair and keeps the findings it reports', async () => {
    const model = recordedModel()
    const result = await runCase({ ...files(() => scratched), ...distinctShots, model, now: () => 0 }, pair({}), context)
    expect(result).toMatchObject({ id: 'case', group: 'damage', origin: 'synthetic', state: 'findings', inputTokens: 2000, outputTokens: 200 })
    // The pair as the set names it, and how well it lined up, so the open scorecard can show it.
    expect(result).toMatchObject({ view: 'frame-left', before: 'gate/before.jpg', after: 'gate/after.jpg' })
    expect(result.alignment).toBeGreaterThan(0.5)
    expect(result.findings).toEqual([expect.objectContaining({ class: 'new_damage', secondLookConfirmed: true })])
    expect(model.requests.map((each) => each.kind)).toEqual(['first', 'second'])
  })

  it('sends a return photograph that repeats earlier evidence to a person without calling the model', async () => {
    const model = recordedModel()
    const copied = { fingerprint: () => Promise.resolve({ sha256: 'same', perceptualHash: 'same' }) }
    const result = await runCase({ ...files(() => before), ...copied, model, now: () => 0 }, pair({ group: 'identity', labels: [], earlier: ['gate/earlier.jpg'] }), context)
    expect(result.state).toBe('deferred')
    expect(result.alignment).toBeNull()
    expect(model.requests).toEqual([])
  })

  // A miss is either code finding nothing or the model setting aside what code found; the record must tell them apart.
  it('keeps how many areas code found and how many the model dismissed', async () => {
    const requests: LookRequest[] = []
    const dismissing: ComparisonModel = {
      look(request) {
        requests.push(request)
        return Promise.resolve({ kind: 'result', model: 'recorded-model', inputTokens: 1000, outputTokens: 100, data: { sameItem: true, sameView: true, findings: [], dismissed: [{ candidate: 0, reason: 'reflection' }] } })
      },
    }
    const result = await runCase({ ...files(() => scratched), ...distinctShots, model: dismissing, now: () => 0 }, pair({}), context)
    expect(result.state).toBe('clean')
    expect(result.codeAreas).toEqual({ found: expect.any(Number) as number, dismissed: 1, unaccounted: expect.any(Number) as number })
    expect(result.codeAreas?.found).toBeGreaterThanOrEqual(1)
  })

  it('records no code areas for a pair that never reached the comparison', async () => {
    const copied = { fingerprint: () => Promise.resolve({ sha256: 'same', perceptualHash: 'same' }) }
    const result = await runCase({ ...files(() => before), ...copied, model: recordedModel(), now: () => 0 }, pair({ group: 'identity', labels: [], earlier: ['gate/earlier.jpg'] }), context)
    expect(result.codeAreas).toBeNull()
  })

  it('passes the known marks to the pipeline so it can set them aside', async () => {
    const model = recordedModel()
    const result = await runCase({ ...files(() => scratched), ...distinctShots, model, now: () => 0 }, pair({ group: 'known_mark', labels: [], knownMarks: [{ x: 0.4, y: 0.42, width: 0.12, height: 0.1 }] }), context)
    expect(result.findings[0]?.class).toBe('known_mark')
    expect(result.state).toBe('clean')
  })
})
