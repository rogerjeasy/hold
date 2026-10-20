import { createRequire } from 'node:module'
import { checkPhotoQuality } from '@hold/domain'
import type { Region } from '@hold/domain'
import sharp from 'sharp'
import { measurePhoto, readyOpenCv } from './measure.ts'
import { alignGreys, changedRegions, PAIR_LIMITS } from './pair-regions.ts'

export type PreparedPair = { readonly ok: true; readonly before: Buffer; readonly after: Buffer; readonly alignment: number; readonly offset: { readonly x: number; readonly y: number }; readonly candidates: readonly Region[] }
export type PairResult = PreparedPair | { readonly ok: false; readonly reason: 'quality' | 'alignment' | 'lighting' | 'unreadable' | 'too_many_regions' }

// Both photographs may arrive while WebAssembly is initializing; share its one initialization callback.
let runtime: ReturnType<typeof readyOpenCv> | undefined
const cv = () => runtime ??= readyOpenCv(createRequire(typeof __filename === 'string' ? __filename : import.meta.url)('@techstark/opencv-js'))

async function prepare(body: Buffer) {
  const normalized = await sharp(body, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  const { data, info } = await sharp(normalized).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const measures = measurePhoto((await cv()).cv, { data: new Uint8ClampedArray(data), width: info.width, height: info.height })
  const small = await sharp(normalized).resize({ width: 160 }).greyscale().raw().toBuffer({ resolveWithObject: true })
  return { image: await sharp(normalized).jpeg({ quality: 90 }).toBuffer(), width: info.width, height: info.height, measures, grey: { data: small.data, width: small.info.width, height: small.info.height } }
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
  if (first.grey.height !== second.grey.height) return { ok: false, reason: 'alignment' }
  if (Math.abs(first.measures.shadows - second.measures.shadows) > 80 || Math.abs(first.measures.highlights - second.measures.highlights) > 80) return { ok: false, reason: 'lighting' }
  // Correct exposure as a pair. Stretching each histogram independently can turn one new white mark into a
  // brightness difference across the entire image, hiding the true alignment.
  const median = (data: Buffer) => [...data].sort((a, b) => a - b)[Math.floor(data.length / 2)] ?? 0
  const exposure = median(second.grey.data) - median(first.grey.data)
  const corrected = { ...second.grey, data: second.grey.data.map((level) => Math.max(0, Math.min(255, level - exposure))) }
  const aligned = alignGreys(first.grey, corrected)
  if (aligned.score < PAIR_LIMITS.minAlignment) return { ok: false, reason: 'alignment' }
  const candidates = changedRegions(first.grey, corrected, aligned.dx, aligned.dy)
  if (candidates.length > PAIR_LIMITS.maxRegions) return { ok: false, reason: 'too_many_regions' }
  return { ok: true, before: first.image, after: await sharp(second.image).linear(1, -exposure).jpeg().toBuffer(), alignment: aligned.score, offset: { x: aligned.dx / first.grey.width, y: aligned.dy / first.grey.height }, candidates }
}
