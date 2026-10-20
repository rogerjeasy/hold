import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { inspectPair } from './inspect-pair.ts'

// A deterministic textured object, so alignment can be tested without looking at the evaluation photographs.
async function photograph(shift = 0, mark = false) {
  const pixels = Buffer.alloc(640 * 480 * 3, 140)
  for (let y = 70; y < 410; y += 1) for (let x = 90; x < 550; x += 1) {
    const level = ((x * 13 + y * 7 + ((x >> 4) * (y >> 4))) % 180) + 30
    for (let c = 0; c < 3; c += 1) pixels[(y * 640 + x + shift) * 3 + c] = mark && x > 260 && x < 310 && y > 190 && y < 250 ? 255 : level
  }
  return sharp(pixels, { raw: { width: 640, height: 480, channels: 3 } }).jpeg().toBuffer()
}

describe('preparing a comparison pair', () => {
  it('aligns a small camera translation and finds the new marked region', async () => {
    const result = await inspectPair(await photograph(), await photograph(8, true))
    expect(result.ok, result.ok ? 'prepared' : result.reason).toBe(true)
    if (!result.ok) throw new Error(result.reason)
    expect(result.alignment).toBeGreaterThan(0.9)
    expect(result.candidates.some((region) => region.x < 0.46 && region.x + region.width > 0.46 && region.y < 0.46 && region.y + region.height > 0.46)).toBe(true)
  })

  it('finds no changed region for the same view', async () => {
    const original = await photograph()
    const result = await inspectPair(original, original)
    expect(result).toMatchObject({ ok: true, candidates: [] })
  })

  it('defers photographs that are too dark, and invalid image bytes', async () => {
    const dark = await sharp({ create: { width: 640, height: 480, channels: 3, background: 'black' } }).jpeg().toBuffer()
    expect(await inspectPair(await photograph(), dark)).toMatchObject({ ok: false, reason: 'quality' })
    expect(await inspectPair(Buffer.from('invalid'), dark)).toMatchObject({ ok: false, reason: 'unreadable' })
  })
})
