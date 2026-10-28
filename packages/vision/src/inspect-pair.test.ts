import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import { mapPoint } from './homography.ts'
import type { Homography, Point } from './homography.ts'
import { inspectPair } from './inspect-pair.ts'

// The demonstration's handover photograph: a real bike frame on a dark background, 1600 by 685 pixels.
const SAMPLE = join(import.meta.dirname, '../../../apps/web/public/images/sample-handover.jpg')
const OTHER = join(import.meta.dirname, '../../../apps/web/public/images/renter.jpg')
const WIDTH = 1600
const HEIGHT = 685
// A spot on the down tube, in handover pixels.
const CHIP: Point = { x: 560, y: 467 }

let handover: Buffer

beforeAll(async () => {
  handover = await readFile(SAMPLE)
})

const multiply = (first: Homography, second: Homography): Homography => {
  const cell = (row: number, column: number) => [0, 1, 2].reduce((sum, k) => sum + (first[row * 3 + k] ?? 0) * (second[k * 3 + column] ?? 0), 0)
  return [cell(0, 0), cell(0, 1), cell(0, 2), cell(1, 0), cell(1, 1), cell(1, 2), cell(2, 0), cell(2, 1), cell(2, 2)]
}
const invert = ([a, b, c, d, e, f, g, h, i]: Homography): Homography => {
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  return [(e * i - f * h) / determinant, (c * h - b * i) / determinant, (b * f - c * e) / determinant, (f * g - d * i) / determinant, (a * i - c * g) / determinant, (c * d - a * f) / determinant, (d * h - e * g) / determinant, (b * g - a * h) / determinant, (a * e - b * d) / determinant]
}
// A camera move about the middle of the frame.
const about = (matrix: Homography) => multiply(multiply([1, 0, WIDTH / 2, 0, 1, HEIGHT / 2, 0, 0, 1], matrix), [1, 0, -WIDTH / 2, 0, 1, -HEIGHT / 2, 0, 0, 1])
const turn = (degrees: number, scale = 1): Homography => {
  const angle = (degrees * Math.PI) / 180
  return [scale * Math.cos(angle), -scale * Math.sin(angle), 0, scale * Math.sin(angle), scale * Math.cos(angle), 0, 0, 0, 1]
}

// A second, handheld photograph of the same view, made without OpenCV so the test does not grade the library with
// itself: each return pixel is read back through the inverse move, with bilinear sampling, and saved again as a JPEG.
async function moved(photo: Buffer, move: Homography, brighter = 0) {
  const { data } = await sharp(photo).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const back = invert(move)
  const out = Buffer.alloc(WIDTH * HEIGHT * 3)
  const at = (x: number, y: number, c: number) => data[(Math.min(HEIGHT - 1, Math.max(0, y)) * WIDTH + Math.min(WIDTH - 1, Math.max(0, x))) * 3 + c] ?? 0
  for (let y = 0; y < HEIGHT; y += 1) for (let x = 0; x < WIDTH; x += 1) {
    const source = mapPoint(back, { x, y })
    const left = Math.floor(source.x); const top = Math.floor(source.y)
    const fx = source.x - left; const fy = source.y - top
    for (let c = 0; c < 3; c += 1) {
      const value = (at(left, top, c) * (1 - fx) + at(left + 1, top, c) * fx) * (1 - fy) + (at(left, top + 1, c) * (1 - fx) + at(left + 1, top + 1, c) * fx) * fy
      out[(y * WIDTH + x) * 3 + c] = Math.min(255, Math.round(value + brighter))
    }
  }
  return sharp(out, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } }).jpeg({ quality: 88 }).toBuffer()
}

// A chip in the paint about one percent of the photograph's width: a jagged patch of primer grey.
async function chipped(photo: Buffer) {
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = (index / 10) * Math.PI * 2
    const radius = index % 2 === 0 ? 9 : 6
    return `${String(CHIP.x + radius * Math.cos(angle))},${String(CHIP.y + radius * 0.8 * Math.sin(angle))}`
  }).join(' ')
  const mark = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${String(WIDTH)}" height="${String(HEIGHT)}"><polygon points="${points}" fill="#a9adb2"/></svg>`)
  return sharp(photo).composite([{ input: mark }]).jpeg({ quality: 95 }).toBuffer()
}

const MOVES: readonly (readonly [string, Homography, number])[] = [
  ['turned three degrees', about(turn(3)), 0],
  ['zoomed in five percent', about(turn(0, 1.05)), 0],
  ['shifted along and up', [1, 0, 28, 0, 1, -14, 0, 0, 1], 0],
  ['seen a little from one side', about([1, 0, 0, 0, 1, 0, 0.00005, 0.00002, 1]), 0],
  ['turned, zoomed out, shifted, tilted and a little brighter', multiply([1, 0, -18, 0, 1, 9, 0, 0, 1], about(multiply(turn(-2, 0.96), [1, 0, 0, 0, 1, 0, -0.00004, 0.00003, 1]))), 10],
]

const contains = (region: { x: number; y: number; width: number; height: number }, point: Point) => region.x <= point.x && point.x <= region.x + region.width && region.y <= point.y && point.y <= region.y + region.height

describe('preparing a comparison pair', () => {
  it('finds no changed region for the same photograph', async () => {
    const result = await inspectPair(handover, handover)
    expect(result).toMatchObject({ ok: true, candidates: [] })
  })

  it.each(MOVES)('aligns a return photograph %s and finds nothing changed', async (_, move, brighter) => {
    const result = await inspectPair(handover, await moved(handover, move, brighter))
    expect(result.ok, result.ok ? 'prepared' : result.reason).toBe(true)
    if (!result.ok) return
    expect(result.candidates).toEqual([])
    expect(result.alignment).toBeGreaterThan(0.92)
  })

  it.each(MOVES)('aligns a return photograph %s and finds the new chip', async (_, move, brighter) => {
    const result = await inspectPair(handover, await moved(await chipped(handover), move, brighter))
    expect(result.ok, result.ok ? 'prepared' : result.reason).toBe(true)
    if (!result.ok) return
    const where = mapPoint(move, CHIP)
    const chip = { x: where.x / WIDTH, y: where.y / HEIGHT }
    expect(result.candidates.some((region) => contains(region, chip)), JSON.stringify(result.candidates)).toBe(true)
    // Known marks are drawn on the handover photograph: the pair's homography carries them to the return photograph.
    const carried = mapPoint(result.homography, { x: CHIP.x / WIDTH, y: CHIP.y / HEIGHT })
    expect(Math.abs(carried.x - chip.x)).toBeLessThan(0.005)
    expect(Math.abs(carried.y - chip.y)).toBeLessThan(0.005)
  })

  it('gives the handover photograph lined up on the return photograph, so crops of one region show the same place', async () => {
    const result = await inspectPair(handover, await moved(handover, about(turn(3))))
    if (!result.ok) throw new Error(result.reason)
    const [aligned, after] = await Promise.all([sharp(result.alignedBefore).metadata(), sharp(result.after).metadata()])
    expect({ width: aligned.width, height: aligned.height }).toEqual({ width: after.width, height: after.height })
  })

  it('sends a photograph of something else to a person', async () => {
    // Given the handover's range of light, so it is the alignment that refuses it, not the lighting check.
    const tails = async (photo: Buffer) => {
      const levels = [...(await sharp(photo).greyscale().raw().toBuffer())].sort((first, second) => first - second)
      return [levels[Math.floor(levels.length * 0.05)] ?? 0, levels[Math.floor(levels.length * 0.95)] ?? 255] as const
    }
    const resized = await sharp(await readFile(OTHER)).resize({ width: WIDTH, height: HEIGHT, fit: 'cover' }).jpeg().toBuffer()
    const [low, high] = await tails(resized)
    const [wantedLow, wantedHigh] = await tails(handover)
    const gain = (wantedHigh - wantedLow) / Math.max(1, high - low)
    const other = await sharp(resized).linear(gain, wantedLow - low * gain).jpeg().toBuffer()
    expect(await inspectPair(handover, other)).toMatchObject({ ok: false, reason: 'alignment' })
  })

  it('sends a photograph turned too far to be the same view to a person', async () => {
    expect(await inspectPair(handover, await moved(handover, about(turn(0, 1.9))))).toMatchObject({ ok: false })
  })

  it('defers photographs that are too dark, and invalid image bytes', async () => {
    const dark = await sharp({ create: { width: 640, height: 480, channels: 3, background: 'black' } }).jpeg().toBuffer()
    expect(await inspectPair(handover, dark)).toMatchObject({ ok: false, reason: 'quality' })
    expect(await inspectPair(Buffer.from('invalid'), dark)).toMatchObject({ ok: false, reason: 'unreadable' })
  })
})
