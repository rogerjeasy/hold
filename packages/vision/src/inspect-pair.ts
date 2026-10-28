import { checkPhotoQuality } from '@hold/domain'
import type { Region } from '@hold/domain'
import sharp from 'sharp'
import { alignPair, inFractions, inPixels, warpOnto } from './align-pair.ts'
import type { Homography } from './homography.ts'
import { measurePhoto } from './measure.ts'
import { pairCv } from './pair-cv.ts'
import type { Raster } from './pair-cv.ts'
import { alignmentScore, changedRegions, exposureDifference, PAIR_LIMITS, withoutExposure } from './pair-regions.ts'

// One frame for every region: the return photograph's, in fractions of its width and height. Candidates are found
// there, the model is told to report there, and every screen and the evidence pack draw findings on the return
// photograph. The handover photograph is never redrawn for people: `homography` carries a handover position (a known
// mark) to the return photograph, and `alignedBefore`, the handover moved onto the return's frame, is only cut into
// crops, so the handover crop and the return crop of one region show the same place on the item.
export type PreparedPair = { readonly ok: true; readonly before: Buffer; readonly after: Buffer; readonly alignedBefore: Buffer; readonly alignment: number; readonly homography: Homography; readonly candidates: readonly Region[] }
export type PairResult = PreparedPair | { readonly ok: false; readonly reason: 'quality' | 'alignment' | 'lighting' | 'unreadable' | 'too_many_regions' }

async function prepare(body: Buffer) {
  const normalized = await sharp(body, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  const { data, info } = await sharp(normalized).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const measures = measurePhoto((await pairCv()).cv, { data: new Uint8ClampedArray(data), width: info.width, height: info.height })
  const working = sharp(normalized).resize({ width: PAIR_LIMITS.workingSide, height: PAIR_LIMITS.workingSide, fit: 'inside', withoutEnlargement: true })
  const [grey, colour] = await Promise.all([working.clone().greyscale().raw().toBuffer({ resolveWithObject: true }), working.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true })])
  const raster = (pixels: typeof grey, channels: 1 | 3 | 4): Raster => ({ data: new Uint8Array(pixels.data), width: pixels.info.width, height: pixels.info.height, channels })
  return { image: await sharp(normalized).jpeg({ quality: 90 }).toBuffer(), full: raster({ data, info }, 4), measures, grey: raster(grey, 1), colour: raster(colour, 3) }
}

// Rechecks the originals, never the client-supplied measures. Poor evidence always asks a person to inspect.
export async function inspectPair(before: Buffer, after: Buffer): Promise<PairResult> {
  let first: Awaited<ReturnType<typeof prepare>>
  let second: Awaited<ReturnType<typeof prepare>>
  try {
    ;[first, second] = await Promise.all([prepare(before), prepare(after)])
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
  if (checkPhotoQuality(first.measures).length > 0 || checkPhotoQuality(second.measures).length > 0) return { ok: false, reason: 'quality' }
  if (Math.abs(first.measures.shadows - second.measures.shadows) > 80 || Math.abs(first.measures.highlights - second.measures.highlights) > 80) return { ok: false, reason: 'lighting' }
  const { cv } = await pairCv()
  const aligned = alignPair(cv, first.grey, second.grey)
  if (!aligned.ok) return { ok: false, reason: 'alignment' }
  const { image: lined, footprint } = warpOnto(cv, first.colour, aligned.homography, second.colour)
  const covered = footprint.reduce((sum, value) => sum + (value === 255 ? 1 : 0), 0) / footprint.length
  if (covered < PAIR_LIMITS.minOverlap) return { ok: false, reason: 'alignment' }
  const exposure = exposureDifference(second.colour, lined, footprint)
  const corrected = withoutExposure(second.colour, exposure)
  const alignment = alignmentScore(corrected, lined, footprint)
  if (alignment < PAIR_LIMITS.minAlignment) return { ok: false, reason: 'alignment' }
  const candidates = changedRegions(cv, corrected, lined, footprint)
  if (candidates.length > PAIR_LIMITS.maxRegions) return { ok: false, reason: 'too_many_regions' }
  const homography = inFractions(aligned.homography, first.grey, second.grey)
  const shown = warpOnto(cv, first.full, inPixels(homography, first.full, second.full), second.full).image
  const alignedBefore = await sharp(shown.data, { raw: { width: shown.width, height: shown.height, channels: 4 } }).removeAlpha().jpeg({ quality: 90 }).toBuffer()
  return { ok: true, before: first.image, after: await sharp(second.image).linear([1, 1, 1], exposure.map((value) => -value)).jpeg().toBuffer(), alignedBefore, alignment, homography, candidates }
}
