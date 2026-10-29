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
  it.each(['scratch', 'dent', 'crack', 'chip', 'scuff'] as const)('draws a %s inside the region it labels, and nowhere else', async (kind) => {
    const drawn = await drawDamage(photo, { kind, size: 'small' }, seededRandom(7))
    expect(drawn.region.x + drawn.region.width).toBeLessThanOrEqual(1)
    expect(drawn.region.y + drawn.region.height).toBeLessThanOrEqual(1)
    const { inside, outside } = await difference(photo, drawn.image, drawn.region)
    expect(inside).toBeGreaterThan(outside * 4)
  })

  // A flat patch of colour reads as a sticker or an edit, and the model rightly refuses to call it damage. Bare metal
  // and broken paint keep the light that falls on the item: darker where the item is in shadow, brighter where it is lit.
  it.each(['chip', 'scuff'] as const)('draws a %s that keeps the photograph\'s own light', async (kind) => {
    const gradient = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#000' } })
      .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="300" height="400" fill="#3a3008"/><rect x="300" width="300" height="400" fill="#f2d24a"/></svg>') }])
      .jpeg({ quality: 95 }).toBuffer()
    const drawn = await drawDamage(gradient, { kind, size: 'large' }, seededRandom(3), { x: 0.5, y: 0.5 })
    const changed = await changedLuminance(gradient, drawn.image)
    expect(changed.left.count).toBeGreaterThan(20)
    expect(changed.right.count).toBeGreaterThan(20)
    expect(changed.right.mean - changed.left.mean).toBeGreaterThan(25)
  })

  it('puts damage only where the mask marks the item, never on the wall behind it', async () => {
    const mask = await leftThirdMask(photo)
    for (let seed = 1; seed <= 12; seed += 1) {
      const drawn = await drawDamage(photo, { kind: 'scratch', size: 'small' }, seededRandom(seed), undefined, mask)
      expect(drawn.center.x).toBeLessThan(1 / 3)
    }
  })

  it.each(['scratch', 'crack', 'chip', 'scuff'] as const)('keeps a %s on the item: no pixel outside the mask changes', async (kind) => {
    const mask = await leftThirdMask(photo)
    const { width } = await sharp(photo).metadata()
    const third = Math.floor(width / 3)
    // Centred a little inside the edge of the item: a large scratch, crack or chip reaches well past it.
    const drawn = await drawDamage(photo, { kind, size: 'large' }, seededRandom(4), { x: (third - 30) / width, y: 0.5 }, mask)
    const [a, b] = await Promise.all([photo, drawn.image].map((each) => sharp(each).greyscale().raw().toBuffer({ resolveWithObject: true })))
    if (a === undefined || b === undefined) throw new Error('No pixels')
    let outside = 0; let inside = 0
    for (let y = 0; y < a.info.height; y += 1) for (let x = 0; x < a.info.width; x += 1) {
      const index = y * a.info.width + x
      // Inside, any visible change counts; outside, only more than saving the JPEG again can cause.
      const change = Math.abs((a.data[index] ?? 0) - (b.data[index] ?? 0))
      if (x > third + 2) { if (change >= 25) outside += 1 } else if (change >= 12) inside += 1
    }
    expect(inside).toBeGreaterThan(20)
    expect(outside).toBe(0)
    expect(drawn.region.x + drawn.region.width).toBeLessThanOrEqual((third + 3) / width)
  })

  it('refuses a mask that marks no part of the item', async () => {
    const { width, height } = await sharp(photo).metadata()
    const empty = await sharp({ create: { width, height, channels: 3, background: '#000' } }).png().toBuffer()
    await expect(drawDamage(photo, { kind: 'dent', size: 'large' }, seededRandom(1), undefined, empty)).rejects.toThrow('marks no part of the item')
  })
})

// The mean brightness of the pixels the damage changed, in the left and right halves of the photograph.
async function changedLuminance(before: Buffer, after: Buffer) {
  const [a, b] = await Promise.all([before, after].map((each) => sharp(each).greyscale().raw().toBuffer({ resolveWithObject: true })))
  if (a === undefined || b === undefined) throw new Error('No pixels')
  const { width, height } = a.info
  const halves = { left: { sum: 0, count: 0, mean: 0 }, right: { sum: 0, count: 0, mean: 0 } }
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x
    const value = b.data[index] ?? 0
    if (Math.abs(value - (a.data[index] ?? 0)) < 12) continue
    const half = x < width / 2 ? halves.left : halves.right
    half.sum += value; half.count += 1
  }
  for (const half of Object.values(halves)) half.mean = half.sum / Math.max(1, half.count)
  return halves
}

// A mask, the size of the photograph, that marks only its left third as the item.
async function leftThirdMask(of: Buffer): Promise<Buffer> {
  const { width, height } = await sharp(of).metadata()
  const third = Math.floor(width / 3)
  return sharp({ create: { width, height, channels: 3, background: '#000' } })
    .composite([{ input: { create: { width: third, height, channels: 3, background: '#fff' } }, left: 0, top: 0 }])
    .png().toBuffer()
}

describe('the raw photographs', () => {
  it('reads bike, session and view from each file name, and ignores anything else', () => {
    expect(rawCatalog(['A-s1-frame-left.jpg', 'A-s2-frame-left.JPG', 'B-s1-fork.jpeg', 'notes.txt', 'A-s1-fork.mask.png'])).toEqual([
      { bike: 'A', session: 1, view: 'frame-left', file: 'A-s1-frame-left.jpg', generated: false },
      { bike: 'A', session: 2, view: 'frame-left', file: 'A-s2-frame-left.JPG', generated: false },
      { bike: 'B', session: 1, view: 'fork', file: 'B-s1-fork.jpeg', generated: false },
    ])
  })

  it('knows a re-shot made from another photograph by its name', () => {
    expect(rawCatalog(['A-s2-fork.generated.jpg'])).toEqual([{ bike: 'A', session: 2, view: 'fork', file: 'A-s2-fork.generated.jpg', generated: true }])
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

  it('draws damage and known marks inside each raw photograph\'s mask when it has one', async () => {
    const mask = await leftThirdMask(photo)
    const built = await buildSet({ raw, read: () => Promise.resolve(photo), readMask: () => Promise.resolve(mask), seed: 5, perGroup: 2 })
    const centre = (region: { x: number; width: number }) => region.x + region.width / 2
    const damage = built.cases.filter((each) => each.group === 'damage').flatMap((each) => each.labels.map((label) => label.region))
    const marks = built.cases.filter((each) => each.group === 'known_mark').flatMap((each) => each.knownMarks)
    expect(damage.length).toBeGreaterThan(0)
    expect(marks.length).toBeGreaterThan(0)
    for (const region of [...damage, ...marks]) expect(centre(region)).toBeLessThan(1 / 3 + 0.02)
  })

  it('never calls a pair real when its return is a generated re-shot', async () => {
    const generated = rawCatalog(['A-s1-v1.jpg', 'A-s2-v1.generated.jpg', 'A-s3-v1.generated.jpg', 'A-s1-v2.jpg', 'A-s2-v2.generated.jpg', 'A-s3-v2.generated.jpg', 'B-s1-v1.jpg', 'B-s1-v2.jpg'])
    const built = await buildSet({ raw: generated, read: () => Promise.resolve(photo), seed: 2, perGroup: 1 })
    const real = built.cases.filter((each) => each.origin === 'real')
    expect(real.length).toBeGreaterThan(0)
    expect(real.every((each) => each.group === 'identity')).toBe(true)
    for (const each of built.cases.filter((pair) => pair.group.startsWith('clean'))) expect(each.note).toMatch(/^synthetic: /)
  })

  it('builds the same set from the same seed', async () => {
    const first = await buildSet({ raw, read: () => Promise.resolve(photo), seed: 3, perGroup: 1 })
    const second = await buildSet({ raw, read: () => Promise.resolve(photo), seed: 3, perGroup: 1 })
    expect(second.cases).toEqual(first.cases)
  })
})
