import { checkPhotoQuality } from '@hold/domain'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { measurePhoto, readyOpenCv } from './measure.ts'
import type { OpenCv } from './measure.ts'

let cv: OpenCv

// A photograph as the phone's canvas gives it: RGBA pixels. The item is a detailed patch on a plain background.
async function canvasOf(image: ReturnType<typeof sharp>): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height }
}

const detail = (width: number, height: number) => {
  const pixels = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) pixels.fill(((x >> 3) + (y >> 3)) % 2 === 0 ? 30 : 220, (y * width + x) * 3, (y * width + x) * 3 + 3)
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png()
}

async function item(options: { readonly size: number; readonly background: number; readonly blur?: number; readonly light?: number }) {
  const patch = await detail(Math.round(1600 * options.size), Math.round(1200 * options.size)).toBuffer()
  let image = sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: options.background, g: options.background, b: options.background } } }).composite([{ input: patch, gravity: 'centre' }])
  if (options.blur !== undefined) image = sharp(await image.png().toBuffer()).blur(options.blur)
  if (options.light !== undefined) image = sharp(await image.png().toBuffer()).linear(options.light, 0)
  return canvasOf(image)
}

beforeAll(async () => {
  // Required, not imported: an import of OpenCV.js is taken for a promise and never settles (see readyOpenCv).
  cv = (await readyOpenCv(createRequire(import.meta.url)('@techstark/opencv-js'))).cv
}, 60_000)

describe('measuring a photograph on the phone', () => {
  it('passes a sharp, well lit photograph the item fills', async () => {
    const measures = measurePhoto(cv, await item({ size: 0.7, background: 140 }))
    expect(checkPhotoQuality(measures)).toEqual([])
  })

  it('catches a blurred photograph', async () => {
    expect(checkPhotoQuality(measurePhoto(cv, await item({ size: 0.7, background: 140, blur: 25 })))).toContain('blurred')
  })

  it('catches a photograph too dark to see the item', async () => {
    const dark = await item({ size: 0.7, background: 140, light: 0.1 })
    expect(checkPhotoQuality(measurePhoto(cv, dark))).toContain('too_dark')
  })

  it('catches an item too small in the frame', async () => {
    expect(checkPhotoQuality(measurePhoto(cv, await item({ size: 0.1, background: 140 })))).toContain('badly_framed')
  })
})
