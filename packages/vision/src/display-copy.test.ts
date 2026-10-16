import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { displayCopy, DISPLAY_LONGEST_SIDE, perceptualHash } from './display-copy.ts'

// A noisy photograph-like image: sharp detail everywhere, so a blur shows as lost detail.
async function photograph(width: number, height: number, seed = 1): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3)
  let state = seed
  for (let index = 0; index < pixels.length; index += 1) {
    state = (state * 1103515245 + 12345) % 2147483648
    pixels[index] = state % 256
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).withMetadata({ exif: { IFD0: { Copyright: 'phone' } } }).jpeg().toBuffer()
}

// How much the pixels in a box vary: detail is variance, and a blurred box has little.
async function variance(image: Buffer, box: { left: number; top: number; width: number; height: number }): Promise<number> {
  const { data } = await sharp(image).extract(box).greyscale().raw().toBuffer({ resolveWithObject: true })
  const mean = data.reduce((sum, value) => sum + value, 0) / data.length
  return data.reduce((sum, value) => sum + (value - mean) ** 2, 0) / data.length
}

describe('the display copy', () => {
  it('is smaller, keeps the shape, and carries none of the phone’s metadata', async () => {
    const copy = await displayCopy(await photograph(3200, 1600), [])
    const info = await sharp(copy).metadata()
    expect([info.width, info.height]).toEqual([DISPLAY_LONGEST_SIDE, DISPLAY_LONGEST_SIDE / 2])
    expect(info.format).toBe('jpeg')
    expect(info.exif).toBeUndefined()
  })

  it('blurs each face so it cannot be recognised, and leaves the rest sharp', async () => {
    const copy = await displayCopy(await photograph(1600, 800), [{ x: 0.5, y: 0.25, width: 0.25, height: 0.5 }])
    const face = await variance(copy, { left: 850, top: 250, width: 300, height: 300 })
    const rest = await variance(copy, { left: 100, top: 250, width: 300, height: 300 })
    expect(face).toBeLessThan(rest / 10)
  })
})

// A picture with shapes in it, as a photograph of an item has: the fingerprint follows its light and dark areas.
const scene = (shapes: string) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#ddd"/>${shapes}</svg>`)).jpeg().toBuffer()

describe('the perceptual fingerprint', () => {
  it('is the same for a resized copy of a photograph and different for another photograph', async () => {
    const original = await scene('<circle cx="250" cy="300" r="180" fill="#222"/><rect x="520" y="80" width="200" height="420" fill="#555"/>')
    const resized = await sharp(original).resize(400, 300).jpeg({ quality: 60 }).toBuffer()
    const other = await scene('<rect x="40" y="40" width="300" height="160" fill="#111"/><circle cx="600" cy="420" r="150" fill="#666"/>')
    const hash = await perceptualHash(original)
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
    const distance = (first: string, second: string) => (BigInt(`0x${first}`) ^ BigInt(`0x${second}`)).toString(2).replaceAll('0', '').length
    expect(distance(hash, await perceptualHash(resized))).toBeLessThanOrEqual(6)
    expect(distance(hash, await perceptualHash(other))).toBeGreaterThan(10)
  })
})
