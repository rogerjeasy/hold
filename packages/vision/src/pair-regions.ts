import type { Region } from '@hold/domain'
import { rasterMat, withMats } from './pair-cv.ts'
import type { PairCv, Raster } from './pair-cv.ts'

// What differs between a lined-up pair: the return photograph and the handover photograph moved onto its frame, both
// in colour, since a grey chip on blue paint can be as bright as the paint. Starting values, measured only on
// synthetic moves of the sample photograph (inspect-pair.test.ts); the evaluation set's tuning half measures them
// before the accuracy gate is released.
export const PAIR_LIMITS = {
  // Both photographs are aligned and compared with this many pixels on their longer side, so a chip one percent of
  // the photograph's width is about ten pixels across.
  workingSide: 1024,
  // Below this similarity of the lined-up pair (1 is identical), the alignment is not trusted.
  minAlignment: 0.92,
  // The handover must cover at least this share of the return photograph once lined up.
  minOverlap: 0.6,
  // A difference in any colour channel above this, after exposure correction, counts as a change.
  pixelDifference: 35,
  // A pixel counts as changed only if no pixel this near it in the other photograph explains it, so an alignment off by
  // a pixel or two, or resampling, does not draw every edge.
  tolerance: 2,
  // Changed pixels this near each other form one region.
  join: 6,
  // A region needs at least this many changed pixels: smaller ones are noise.
  minPixels: 12,
  // Each region keeps this many pixels around its changed pixels, so even the smallest is over a hundredth of the
  // photograph on each side, as a region must be (checkRegion).
  margin: 6,
  maxRegions: 8,
} as const

const inside = (footprint: Uint8Array, pixel: number) => footprint[pixel] === 255

// Each channel's median difference over the part both photographs show, to take from the return photograph.
// Correcting as a pair matters: stretching each histogram independently can turn one new white mark into a brightness
// difference across the entire image.
export function exposureDifference(after: Raster, before: Raster, footprint: Uint8Array): readonly number[] {
  const median = (image: Raster, channel: number) => {
    const counts = new Array<number>(256).fill(0)
    let total = 0
    for (let pixel = 0; pixel < image.width * image.height; pixel += 1) if (inside(footprint, pixel)) {
      const level = image.data[pixel * image.channels + channel] ?? 0
      counts[level] = (counts[level] ?? 0) + 1
      total += 1
    }
    let seen = 0
    return counts.findIndex((count) => (seen += count) > total / 2)
  }
  return Array.from({ length: after.channels }, (_, channel) => median(after, channel) - median(before, channel))
}

export function withoutExposure(image: Raster, exposure: readonly number[]): Raster {
  return { ...image, data: image.data.map((level, index) => Math.max(0, Math.min(255, level - (exposure[index % image.channels] ?? 0)))) }
}

// 1 minus the mean difference of the best-matching nine tenths of the overlap, so a small changed region does not
// lower the score of an otherwise well-aligned pair.
export function alignmentScore(after: Raster, before: Raster, footprint: Uint8Array): number {
  // How many pixels differ by each total over their channels, from 0 to 255 for every channel.
  const counts = new Array<number>(255 * after.channels + 1).fill(0)
  let total = 0
  for (let pixel = 0; pixel < after.width * after.height; pixel += 2) {
    if (!inside(footprint, pixel)) continue
    let sum = 0
    for (let channel = 0; channel < after.channels; channel += 1) sum += Math.abs((after.data[pixel * after.channels + channel] ?? 0) - (before.data[pixel * after.channels + channel] ?? 0))
    counts[sum] = (counts[sum] ?? 0) + 1
    total += 1
  }
  let left = Math.floor(total * 0.9)
  const kept = left
  let differences = 0
  for (const [sum, count] of counts.entries()) {
    const taken = Math.min(count, left)
    differences += taken * sum
    left -= taken
    if (left === 0) break
  }
  return kept === 0 ? 0 : 1 - differences / (kept * 255 * after.channels)
}

// Regions, as fractions of the return photograph, where the two differ by more than either's near neighbourhood
// explains. Only where the handover photograph lands counts: the rest of the return frame was never photographed.
export function changedRegions(cv: PairCv, after: Raster, before: Raster, footprint: Uint8Array): readonly Region[] {
  const { width, height, channels } = after
  return withMats((made) => {
    const kernel = (radius: number) => made(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(radius * 2 + 1, radius * 2 + 1)))
    const near = kernel(PAIR_LIMITS.tolerance)
    const range = (image: Raster) => {
      const smooth = made(new cv.Mat())
      cv.GaussianBlur(made(rasterMat(cv, image)), smooth, new cv.Size(3, 3), 0)
      const low = made(new cv.Mat())
      const high = made(new cv.Mat())
      cv.erode(smooth, low, near)
      cv.dilate(smooth, high, near)
      return { value: smooth.data, low: low.data, high: high.data }
    }
    const first = range(after)
    const second = range(before)
    // Away from the edge of the handover's footprint, where resampling blends it with the empty frame.
    const kept = made(new cv.Mat())
    cv.erode(made(rasterMat(cv, { data: footprint, width, height, channels: 1 })), kept, kernel(PAIR_LIMITS.tolerance + 2))
    const outside = (value: number, low: number, high: number) => Math.max(0, value - high, low - value)
    const changed = made(new cv.Mat(height, width, cv.CV_8UC1))
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      let difference = 0
      if (kept.data[pixel] === 255) for (let channel = 0; channel < channels; channel += 1) {
        const at = pixel * channels + channel
        difference = Math.max(difference, Math.min(
          outside(first.value[at] ?? 0, second.low[at] ?? 0, second.high[at] ?? 0),
          outside(second.value[at] ?? 0, first.low[at] ?? 0, first.high[at] ?? 0),
        ))
      }
      changed.data[pixel] = difference > PAIR_LIMITS.pixelDifference ? 255 : 0
    }
    const joined = made(new cv.Mat())
    cv.dilate(changed, joined, kernel(PAIR_LIMITS.join))
    const labels = made(new cv.Mat())
    const count = cv.connectedComponentsWithStats(joined, labels, made(new cv.Mat()), made(new cv.Mat()))
    // Each region's box and pixel count come from the changed pixels themselves, not from the joined copy.
    const boxes = Array.from({ length: count }, () => ({ left: width, top: height, right: -1, bottom: -1, pixels: 0 }))
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      if (changed.data[pixel] !== 255) continue
      const box = boxes[labels.data32S[pixel] ?? 0]
      if (box === undefined) continue
      const x = pixel % width; const y = Math.floor(pixel / width)
      box.left = Math.min(box.left, x); box.top = Math.min(box.top, y); box.right = Math.max(box.right, x); box.bottom = Math.max(box.bottom, y)
      box.pixels += 1
    }
    return boxes.slice(1).filter((box) => box.pixels >= PAIR_LIMITS.minPixels).map((box) => {
      const left = Math.max(0, box.left - PAIR_LIMITS.margin)
      const top = Math.max(0, box.top - PAIR_LIMITS.margin)
      const right = Math.min(width, box.right + 1 + PAIR_LIMITS.margin)
      const bottom = Math.min(height, box.bottom + 1 + PAIR_LIMITS.margin)
      return { x: left / width, y: top / height, width: (right - left) / width, height: (bottom - top) / height }
    })
  })
}
