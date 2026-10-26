import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { groupCounts, loadHalf, manifestSchema, SET_TARGETS } from './manifest.ts'

const region = { x: 0.4, y: 0.4, width: 0.1, height: 0.1 }
const base = { version: 1, itemType: 'City e-bike', wearPolicy: 'Scuffs on tyres are wear.', priceCodes: ['scratch'] }
const pair = (id: string, half: 'tuning' | 'gate', overrides: Record<string, unknown> = {}) => ({ id, half, group: 'clean_easy', origin: 'real', view: 'frame-left', before: `${half}/${id}-before.jpg`, after: `${half}/${id}-after.jpg`, labels: [], knownMarks: [], ...overrides })

describe('the evaluation manifest', () => {
  it('requires a region for every damage pair', () => {
    expect(manifestSchema.safeParse({ ...base, cases: [pair('d1', 'gate', { group: 'damage' })] }).success).toBe(false)
    expect(manifestSchema.safeParse({ ...base, cases: [pair('d1', 'gate', { group: 'damage', labels: [{ kind: 'damage', region }] })] }).success).toBe(true)
  })

  it('refuses a clean pair that carries a damage label, and a known-mark pair without its mark', () => {
    expect(manifestSchema.safeParse({ ...base, cases: [pair('c1', 'gate', { labels: [{ kind: 'damage', region }] })] }).success).toBe(false)
    expect(manifestSchema.safeParse({ ...base, cases: [pair('k1', 'gate', { group: 'known_mark' })] }).success).toBe(false)
  })

  it('keeps each half\'s photographs in its own folder', () => {
    expect(manifestSchema.safeParse({ ...base, cases: [pair('c1', 'tuning', { after: 'gate/c1-after.jpg' })] }).success).toBe(false)
  })

  it('refuses a region that leaves the photograph, and a repeated case id', () => {
    expect(manifestSchema.safeParse({ ...base, cases: [pair('d1', 'gate', { group: 'damage', labels: [{ kind: 'damage', region: { ...region, x: 0.95 } }] })] }).success).toBe(false)
    expect(manifestSchema.safeParse({ ...base, cases: [pair('c1', 'gate'), pair('c1', 'gate')] }).success).toBe(false)
  })

  it('states the pair counts the first version aims for', () => {
    expect(SET_TARGETS).toEqual({ clean_easy: 30, clean_hard: 30, wear: 20, damage: 40, known_mark: 15, identity: 10 })
  })
})

describe('loading one half', () => {
  it('reads only the half asked for, and fingerprints it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hold-eval-'))
    for (const half of ['tuning', 'gate'] as const) {
      await mkdir(join(root, half))
      for (const side of ['before', 'after']) await writeFile(join(root, half, `${half}1-${side}.jpg`), `${half}-${side}`)
    }
    await writeFile(join(root, 'manifest.json'), JSON.stringify({ ...base, cases: [pair('tuning1', 'tuning'), pair('gate1', 'gate')] }))
    const tuning = await loadHalf(root, 'tuning')
    expect(tuning.cases.map((each) => each.id)).toEqual(['tuning1'])
    expect(tuning.dataSetVersion).toMatch(/^[a-f0-9]{64}$/)
    expect((await loadHalf(root, 'gate')).dataSetVersion).not.toBe(tuning.dataSetVersion)
  })

  it('fails when a photograph the manifest names is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hold-eval-'))
    await writeFile(join(root, 'manifest.json'), JSON.stringify({ ...base, cases: [pair('gate1', 'gate')] }))
    await expect(loadHalf(root, 'gate')).rejects.toThrow('gate/gate1-before.jpg')
  })

  it('counts pairs per group against the targets', () => {
    expect(groupCounts([pair('a', 'gate'), pair('b', 'gate', { group: 'damage' })] as never)).toMatchObject({ clean_easy: 1, damage: 1, wear: 0 })
  })
})
