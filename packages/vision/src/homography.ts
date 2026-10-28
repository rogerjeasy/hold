import type { Region } from '@hold/domain'

// A 3 by 3 projective transform, row by row, taking a point in one photograph to the same point on the item in another.
export type Homography = readonly [number, number, number, number, number, number, number, number, number]
export type Point = { readonly x: number; readonly y: number }
export type HomographyProblem = 'invalid' | 'flip' | 'scale' | 'skew' | 'perspective'

export const IDENTITY: Homography = [1, 0, 0, 0, 1, 0, 0, 0, 1]

// What a handheld second photograph of the same view can plausibly be: about as near, not mirrored, not stretched,
// not seen from a very different side. Starting values, to be measured on the evaluation set's tuning half.
export const HOMOGRAPHY_LIMITS = {
  // The zoom at the frame's centre, as the square root of the area a small square there covers once mapped.
  minScale: 0.67,
  maxScale: 1.5,
  // The largest stretch at the centre over the smallest: a turn or a zoom stretches every direction alike.
  maxAnisotropy: 1.25,
  // How far the perspective divisor at a corner of the frame may differ from the one at its centre. By geometry, not
  // measurement: with a phone's field of view of about 65 degrees, 0.2 is a camera turned about 18 degrees aside.
  maxPerspective: 0.2,
} as const

export function mapPoint(homography: Homography, point: Point): Point {
  const [a, b, c, d, e, f, g, h, i] = homography
  const w = g * point.x + h * point.y + i
  return { x: (a * point.x + b * point.y + c) / w, y: (d * point.x + e * point.y + f) / w }
}

// A box in fractions of one photograph, as the box around its four mapped corners in the other, kept inside the frame.
export function mapRegion(homography: Homography, region: Region): Region {
  const corners = [[region.x, region.y], [region.x + region.width, region.y], [region.x, region.y + region.height], [region.x + region.width, region.y + region.height]]
    .map(([x = 0, y = 0]) => mapPoint(homography, { x, y }))
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  const left = clamp(Math.min(...corners.map((corner) => corner.x)))
  const top = clamp(Math.min(...corners.map((corner) => corner.y)))
  const right = clamp(Math.max(...corners.map((corner) => corner.x)))
  const bottom = clamp(Math.max(...corners.map((corner) => corner.y)))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

// Judged in pixels of the photograph the homography starts from, at the centre of its frame and at its corners.
export function homographyProblem(homography: Homography, size: { readonly width: number; readonly height: number }): HomographyProblem | null {
  if (!homography.every(Number.isFinite)) return 'invalid'
  const [a, b, , d, e, , g, h, i] = homography
  const w = (x: number, y: number) => g * x + h * y + i
  const centre = { x: size.width / 2, y: size.height / 2 }
  const middle = w(centre.x, centre.y)
  if (Math.abs(middle) < 1e-12) return 'invalid'
  const corners = [[0, 0], [size.width, 0], [0, size.height], [size.width, size.height]].map(([x = 0, y = 0]) => w(x, y) / middle)
  // A corner whose w changes sign lies beyond the horizon: the frame folds over itself.
  if (corners.some((value) => value <= 0)) return 'perspective'
  // The local linear part at the centre: how a small square there is turned, zoomed and stretched.
  const mapped = mapPoint(homography, centre)
  const jacobian = [(a - mapped.x * g) / middle, (b - mapped.x * h) / middle, (d - mapped.y * g) / middle, (e - mapped.y * h) / middle]
  const [p = 0, q = 0, r = 0, s = 0] = jacobian
  const determinant = p * s - q * r
  if (determinant <= 0) return 'flip'
  const scale = Math.sqrt(determinant)
  if (scale < HOMOGRAPHY_LIMITS.minScale || scale > HOMOGRAPHY_LIMITS.maxScale) return 'scale'
  // The ratio of the largest to the smallest stretch (the two singular values).
  const squares = p * p + q * q + r * r + s * s
  const spread = Math.sqrt(Math.max(0, squares * squares - 4 * determinant * determinant))
  if (Math.sqrt((squares + spread) / (squares - spread)) > HOMOGRAPHY_LIMITS.maxAnisotropy) return 'skew'
  if (corners.some((value) => Math.abs(value - 1) > HOMOGRAPHY_LIMITS.maxPerspective)) return 'perspective'
  return null
}
