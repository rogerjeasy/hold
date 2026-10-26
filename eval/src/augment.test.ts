import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildSet, drawDamage, rawCatalog, seededRandom } from './augment.ts'
import { manifestSchema } from './manifest.ts'

const SAMPLE = join(import.meta.dirname, '../../apps/web/public/images/sample-handover.jpg')
let photo: Buffer
beforeAll(async () => { photo = await readFile(SAMPLE) })

// The mean absolute difference between two photographs inside a region, and outside it.
async function difference(first: Buffer, second: Buffer, region: { x: number; y: number; width: number; height: number }) {
  const [a, b] = await Promise.all([first, second].map((each) => sharp(each).greyscale().raw().toBuffer({ resolveWithObject: true })))
  if (a === undefined || b === undefined) throw new Error('No pixels')
  const { width, height } = a.info
  let inside = 0; let insideCount = 0; let outside = 0; let outsideCount = 0
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const delta = Math.abs((a.data[y * width + x] ?? 0) - (b.data[y * width + x] ?? 0))
    const within = x / width >= region.x && x / width <= region.x + region.width && y / height >= region.y && y / height <= region.y + region.height
    if (within) { inside += delta; insideCount += 1 } else { outside += delta; outsideCount += 1 }
  }
  return { inside: inside / Math.max(1, insideCount), outside: outside / Math.max(1, outsideCount) }
}

describe('drawing synthetic damage', () => {
  it.each(['scratch', 'dent', 'crack', 'chip', 'missing'] as const)('draws a %s inside the region it labels, and nowhere else', async (kind) => {
    const drawn = await drawDamage(photo, { kind, size: 'small' }, seededRandom(7))
    expect(drawn.region.x + drawn.region.width).toBeLessThanOrEqual(1)
    expect(drawn.region.y + drawn.region.height).toBeLessThanOrEqual(1)
    const { inside, outside } = await difference(photo, drawn.image, drawn.region)
    expect(inside).toBeGreaterThan(outside * 4)
  })
})

describe('the raw photographs', () => {
  it('reads bike, session and view from each file name, and ignores anything else', () => {
    expect(rawCatalog(['A-s1-frame-left.jpg', 'A-s2-frame-left.JPG', 'B-s1-fork.jpeg', 'notes.txt'])).toEqual([
      { bike: 'A', session: 1, view: 'frame-left', file: 'A-s1-frame-left.jpg' },
      { bike: 'A', session: 2, view: 'frame-left', file: 'A-s2-frame-left.JPG' },
      { bike: 'B', session: 1, view: 'fork', file: 'B-s1-fork.jpeg' },
    ])
  })
})

describe('building the set', () => {
  const raw = rawCatalog(['A-s1-v1.jpg', 'A-s2-v1.jpg', 'A-s3-v1.jpg', 'A-s1-v2.jpg', 'A-s2-v2.jpg', 'A-s3-v2.jpg', 'B-s1-v1.jpg', 'B-s1-v2.jpg'])

  it('keeps every view in one half, labels every synthetic pair, and passes the manifest rules', async () => {
    const built = await buildSet({ raw, read: () => Promise.resolve(photo), seed: 11, perGroup: 2 })
    const manifest = manifestSchema.parse({ version: 1, itemType: 'City e-bike', wearPolicy: 'Mud is wear.', priceCodes: [], cases: built.cases })
    const halvesOfView = new Map<string, Set<string>>()
    for (const each of manifest.cases) halvesOfView.set(each.view, (halvesOfView.get(each.view) ?? new Set()).add(each.half))
    expect([...halvesOfView.values()].every((halves) => halves.size === 1)).toBe(true)
    expect(new Set(manifest.cases.map((each) => each.half))).toEqual(new Set(['tuning', 'gate']))
    expect(manifest.cases.filter((each) => each.group === 'clean_easy' && each.origin === 'real').length).toBeGreaterThan(0)
    for (const each of manifest.cases.filter((pair) => pair.origin === 'synthetic')) expect(each.note).toMatch(/^synthetic: /)
    for (const each of built.cases) for (const path of [each.before, each.after, ...each.earlier]) expect(built.files.has(path)).toBe(true)
  })

  it('never builds a pair from one shot, so the reuse check cannot catch a synthetic pair by accident', async () => {
    const built = await buildSet({ raw, read: () => Promise.resolve(photo), seed: 11, perGroup: 2 })
    for (const each of built.cases.filter((pair) => pair.group !== 'identity')) expect(built.sources.get(each.before)).not.toBe(built.sources.get(each.after))
  })

  it('builds the same set from the same seed', async () => {
    const first = await buildSet({ raw, read: () => Promise.resolve(photo), seed: 3, perGroup: 1 })
    const second = await buildSet({ raw, read: () => Promise.resolve(photo), seed: 3, perGroup: 1 })
    expect(second.cases).toEqual(first.cases)
  })
})
