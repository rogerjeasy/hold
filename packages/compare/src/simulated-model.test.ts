import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { inspectPair } from '@hold/vision/inspect-pair'
import { describe, expect, it } from 'vitest'
import { compareInspection } from './pipeline.ts'
import { createSimulatedComparisonModel } from './simulated-model.ts'

// The demonstration's own photographs, as the web app serves them.
const SAMPLE_IMAGES = join(import.meta.dirname, '..', '..', '..', 'apps', 'web', 'public', 'images')
const sample = (file: string) => readFile(join(SAMPLE_IMAGES, file))
const signal = new AbortController().signal
const context = (candidateRegions: readonly unknown[]) => JSON.stringify({ itemType: 'E-bike', wearPolicy: 'Scuffs are wear', priceCodes: ['chip'], knownMarks: [], candidateRegions })

async function compared(after: string) {
  const pair = await inspectPair(await sample('sample-handover.jpg'), await sample(after))
  if (!pair.ok) throw new Error(pair.reason)
  const result = await compareInspection({ views: [{ view: 'frame-left', pair }], marks: [], wearPolicy: 'Scuffs are wear', itemType: 'E-bike', priceCodes: ['chip'] }, createSimulatedComparisonModel())
  return { pair, result }
}

// The test environment's stand-in for Claude (architecture.md section 20.3): code finds what changed, and the stand-in
// words each change code found. It sees nothing itself, so it adds no area, picks no price and answers in no model's name.
describe('the simulated comparison model', () => {
  it('explains the change code found on the sample with damage as a finding over that area, with no price', async () => {
    const { pair, result } = await compared('sample-return-damage.jpg')
    expect(pair.candidates.length).toBeGreaterThan(0)
    expect(result).toMatchObject({ state: 'findings', model: 'simulated', alignment: { inputTokens: 0, outputTokens: 0 } })
    expect(result.findings.map((finding) => finding.region)).toEqual(pair.candidates)
    expect(result.findings.every((finding) => finding.class === 'new_damage' && finding.priceCode === null && finding.secondLookConfirmed === true && finding.description.startsWith('Simulated'))).toBe(true)
  })

  it('finds nothing where code found no change', async () => {
    const { result } = await compared('sample-handover.jpg')
    expect(result).toMatchObject({ state: 'clean', findings: [], model: 'simulated' })
  })

  it('reports exactly the areas it is given, and none it is not', async () => {
    const regions = [{ x: 0.1, y: 0.1, width: 0.1, height: 0.1 }, { x: 0.5, y: 0.6, width: 0.2, height: 0.1 }]
    const reply = await createSimulatedComparisonModel().look({ kind: 'first', context: context(regions), images: [] }, signal)
    expect(reply).toMatchObject({ kind: 'result', model: 'simulated', inputTokens: 0, outputTokens: 0, data: { sameItem: true, sameView: true, dismissed: [] } })
    expect(reply.kind === 'result' ? (reply.data as { findings: { region: unknown }[] }).findings.map((finding) => finding.region) : []).toEqual(regions)
  })

  it('does not answer a request it cannot read', async () => {
    expect(await createSimulatedComparisonModel().look({ kind: 'first', context: 'not json', images: [] }, signal)).toEqual({ kind: 'unavailable', model: 'simulated' })
  })
})
