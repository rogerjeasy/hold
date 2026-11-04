import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import { seededRandom } from './augment.ts'
import { damagePatchSources, pasteDamage } from './damage.ts'
import type { DamagePatch } from './damage.ts'

const SAMPLE = join(import.meta.dirname, '../../apps/web/public/images/sample-handover.jpg')
const DAMAGE = join(import.meta.dirname, '../raw/damage')
let photo: Buffer
let patch: DamagePatch
beforeAll(async () => {
  photo = await readFile(SAMPLE)
  // A stand-in for a photograph of damage: a pale, grainy blob on a transparent ground, as the cut patches are.
  const blob = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="160"><filter id="g"><feTurbulence baseFrequency="0.8" numOctaves="2"/></filter><ellipse cx="100" cy="80" rx="80" ry="55" fill="#d8d4cc"/><ellipse cx="100" cy="80" rx="80" ry="55" filter="url(#g)" opacity="0.5"/></svg>')
  patch = { name: 'test-blob', kind: 'chip', image: await sharp(blob).png().toBuffer() }
})

async function greys(image: Buffer) {
  return sharp(image).greyscale().raw().toBuffer({ resolveWithObject: true })
}

async function leftThirdMask(image: Buffer): Promise<Buffer> {
  const { width, height } = await sharp(image).metadata()
  const third = Math.floor(width / 3)
  return sharp({ create: { width, height, channels: 3, background: '#000' } }).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}"><rect width="${String(third)}" height="${String(height)}" fill="#fff"/></svg>`) }]).png().toBuffer()
}

describe('pasting a photograph of real damage', () => {
  it.each(['small', 'large'] as const)('pastes %s damage inside the region it labels, and nowhere else', async (size) => {
    const pasted = await pasteDamage(photo, patch, size, seededRandom(9))
    const [a, b] = await Promise.all([greys(photo), greys(pasted.image)])
    const { width, height } = a.info
    const { region } = pasted
    expect(region.x + region.width).toBeLessThanOrEqual(1)
    expect(region.y + region.height).toBeLessThanOrEqual(1)
    let inside = 0; let insideCount = 0; let outside = 0; let outsideCount = 0
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const delta = Math.abs((a.data[y * width + x] ?? 0) - (b.data[y * width + x] ?? 0))
      const within = x / width >= region.x && x / width <= region.x + region.width && y / height >= region.y && y / height <= region.y + region.height
      if (within) { inside += delta; insideCount += 1 } else { outside += delta; outsideCount += 1 }
    }
    expect(inside / insideCount).toBeGreaterThan((outside / outsideCount) * 4)
  })

  // Bare metal or rust in shadow is darker than the same damage in the light: pasted as it was photographed, it would
  // read as a sticker.
  it('takes on the light where it lands', async () => {
    const halves = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#000' } })
      .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="400" height="400" fill="#2a2a2a"/><rect x="400" width="400" height="400" fill="#e0e0e0"/></svg>') }])
      .jpeg({ quality: 95 }).toBuffer()
    const inShadow = await pasteDamage(halves, patch, 'large', seededRandom(2), { x: 0.25, y: 0.5 })
    const inLight = await pasteDamage(halves, patch, 'large', seededRandom(2), { x: 0.75, y: 0.5 })
    const mean = async (image: Buffer, region: { x: number; y: number; width: number; height: number }) => {
      const { data, info } = await greys(image)
      let sum = 0; let count = 0
      for (let y = Math.floor(region.y * info.height); y < (region.y + region.height) * info.height; y += 1) for (let x = Math.floor(region.x * info.width); x < (region.x + region.width) * info.width; x += 1) { sum += data[y * info.width + x] ?? 0; count += 1 }
      return sum / count
    }
    expect(await mean(inLight.image, inLight.region) - await mean(inShadow.image, inShadow.region)).toBeGreaterThan(60)
  })

  it('keeps the damage on the item: no pixel outside the mask changes', async () => {
    const mask = await leftThirdMask(photo)
    const { width } = await sharp(photo).metadata()
    const third = Math.floor(width / 3)
    const pasted = await pasteDamage(photo, patch, 'large', seededRandom(4), { x: (third - 30) / width, y: 0.5 }, mask)
    const [a, b] = await Promise.all([greys(photo), greys(pasted.image)])
    let outside = 0; let inside = 0
    for (let y = 0; y < a.info.height; y += 1) for (let x = 0; x < a.info.width; x += 1) {
      const index = y * a.info.width + x
      const change = Math.abs((a.data[index] ?? 0) - (b.data[index] ?? 0))
      if (x > third + 2) { if (change >= 25) outside += 1 } else if (change >= 12) inside += 1
    }
    expect(inside).toBeGreaterThan(20)
    expect(outside).toBe(0)
    expect(pasted.region.x + pasted.region.width).toBeLessThanOrEqual((third + 3) / width)
  })

  // Damage cut off by the edge of the item reads as a jagged fragment, and a label over a sliver is a miss nobody could
  // see: a place where most of the damage would fall off the item is passed over for another.
  it('moves damage that would mostly fall off a narrow item, so the label shows it whole', async () => {
    const { width, height } = await sharp(photo).metadata()
    const strip = await sharp({ create: { width, height, channels: 3, background: '#000' } }).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}"><rect x="${String(Math.round(width * 0.45))}" width="${String(Math.round(width * 0.12))}" height="${String(height)}" fill="#fff"/></svg>`) }]).png().toBuffer()
    for (let seed = 1; seed <= 6; seed += 1) expect((await pasteDamage(photo, patch, 'small', seededRandom(seed), undefined, strip)).onItem).toBeGreaterThanOrEqual(0.85)
  })

  it('places damage inside the mask when no place is given', async () => {
    const mask = await leftThirdMask(photo)
    for (let seed = 1; seed <= 8; seed += 1) expect((await pasteDamage(photo, patch, 'small', seededRandom(seed), undefined, mask)).center.x).toBeLessThan(1 / 3)
  })
})

// Every photograph of damage in the set is someone's work: it must be one the licence lets Hold change and share, and
// it must carry what the licence asks for, the title, the author, the source and the licence itself.
describe('the photographs of real damage', () => {
  it('are all there, each under a licence that allows changes and commercial use, with full credit', async () => {
    const sources = damagePatchSources(JSON.parse(await readFile(join(DAMAGE, 'sources.json'), 'utf8')))
    expect(sources.length).toBeGreaterThanOrEqual(4)
    for (const each of sources) {
      expect(existsSync(join(DAMAGE, each.file))).toBe(true)
      expect(each.licence).toMatch(/^(CC0|Public domain|CC BY(-SA)? [0-9.]+)$/)
      expect(each.licence).not.toMatch(/NC|ND/)
      expect(each.source).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
      expect(each.author.length).toBeGreaterThan(0)
      expect(each.title.length).toBeGreaterThan(0)
    }
  })

  it('refuses a source whose licence forbids changes or commercial use', () => {
    expect(() => damagePatchSources([{ file: 'x.png', kind: 'chip', shows: 'A chip', title: 'X', author: 'Someone', licence: 'CC BY-NC-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/', source: 'https://commons.wikimedia.org/wiki/File:X.jpg', crop: [0, 0, 1, 1] }])).toThrow()
  })
})
