import { homographyProblem } from './homography.ts'
import type { Homography } from './homography.ts'
import { rasterMat, withMats } from './pair-cv.ts'
import type { PairCv, Raster } from './pair-cv.ts'

// Feature alignment: ORB keypoints in both photographs, each matched to its two nearest in the other, kept only when
// clearly better than the second (the ratio test), then a homography fitted by RANSAC. The RANSAC is OpenCV's
// MAGSAC++ variant: on the sample photograph zoomed five percent, classic RANSAC put the frame's corners 4 to 11
// working pixels off, which drew false changes along every strong edge there, and MAGSAC++ under one pixel (measured
// 28 October 2026). A pair is aligned only when enough matches agree on one plausible camera move; otherwise it goes
// to a person, never a guess.
// Starting values, measured only on synthetic moves of the sample photograph (inspect-pair.test.ts); the evaluation
// set's tuning half measures them before the accuracy gate is released.
export const ALIGNMENT_LIMITS = {
  // Keypoints looked for in each photograph at the working size.
  features: 3000,
  // A match counts when its distance is below this share of the next best match's.
  ratio: 0.75,
  // How far, in working pixels, a match may land from where the fitted homography puts it and still agree with it.
  ransacPixels: 3,
  // Agreeing matches needed, as a count and as a share of the matches that passed the ratio test.
  minInliers: 40,
  minInlierShare: 0.3,
} as const

export type Alignment = { readonly ok: true; readonly homography: Homography; readonly inliers: number; readonly share: number } | { readonly ok: false }

// The homography takes a pixel of the handover photograph to the same place on the item in the return photograph.
export function alignPair(cv: PairCv, before: Raster, after: Raster): Alignment {
  return withMats((made) => {
    const orb = made(new cv.ORB(ALIGNMENT_LIMITS.features))
    const find = (image: Raster) => {
      const keypoints = made(new cv.KeyPointVector())
      const descriptors = made(new cv.Mat())
      orb.detectAndCompute(made(rasterMat(cv, image)), made(new cv.Mat()), keypoints, descriptors)
      return { keypoints, descriptors }
    }
    const first = find(before)
    const second = find(after)
    if (first.descriptors.rows < ALIGNMENT_LIMITS.minInliers || second.descriptors.rows < ALIGNMENT_LIMITS.minInliers) return { ok: false }
    const matches = made(new cv.DMatchVectorVector())
    made(new cv.BFMatcher(cv.NORM_HAMMING, false)).knnMatch(first.descriptors, second.descriptors, matches, 2)
    const from: number[] = []
    const to: number[] = []
    for (let index = 0; index < matches.size(); index += 1) {
      const pair = matches.get(index)
      if (pair.size() === 2 && pair.get(0).distance < ALIGNMENT_LIMITS.ratio * pair.get(1).distance) {
        const match = pair.get(0)
        const source = first.keypoints.get(match.queryIdx).pt
        const target = second.keypoints.get(match.trainIdx).pt
        from.push(source.x, source.y)
        to.push(target.x, target.y)
      }
      pair.delete()
    }
    const count = from.length / 2
    if (count < ALIGNMENT_LIMITS.minInliers) return { ok: false }
    const mask = made(new cv.Mat())
    const found = made(cv.findHomography(made(cv.matFromArray(count, 1, cv.CV_32FC2, from)), made(cv.matFromArray(count, 1, cv.CV_32FC2, to)), cv.USAC_MAGSAC, ALIGNMENT_LIMITS.ransacPixels, mask))
    if (found.rows !== 3 || found.cols !== 3) return { ok: false }
    const inliers = mask.data.reduce((sum, value) => sum + (value > 0 ? 1 : 0), 0)
    const share = inliers / count
    if (inliers < ALIGNMENT_LIMITS.minInliers || share < ALIGNMENT_LIMITS.minInlierShare) return { ok: false }
    const values = [...found.data64F]
    const homography: Homography = [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0, values[4] ?? 0, values[5] ?? 0, values[6] ?? 0, values[7] ?? 0, values[8] ?? 0]
    if (homographyProblem(homography, before) !== null) return { ok: false }
    return { ok: true, homography, inliers, share }
  })
}

// The same homography in fractions of each photograph, so it holds at any size either is shown at.
export function inFractions(homography: Homography, from: { readonly width: number; readonly height: number }, to: { readonly width: number; readonly height: number }): Homography {
  const [a, b, c, d, e, f, g, h, i] = homography
  return [(a * from.width) / to.width, (b * from.height) / to.width, c / to.width, (d * from.width) / to.height, (e * from.height) / to.height, f / to.height, g * from.width, h * from.height, i]
}

// The reverse of inFractions: the homography in pixels of photographs of the given sizes.
export function inPixels(homography: Homography, from: { readonly width: number; readonly height: number }, to: { readonly width: number; readonly height: number }): Homography {
  const [a, b, c, d, e, f, g, h, i] = homography
  return [(a * to.width) / from.width, (b * to.width) / from.height, c * to.width, (d * to.height) / from.width, (e * to.height) / from.height, f * to.height, g / from.width, h / from.height, i]
}

// One photograph's pixels moved onto another's frame by a homography in pixels, and where it lands (255 inside).
export function warpOnto(cv: PairCv, image: Raster, homography: Homography, size: { readonly width: number; readonly height: number }): { readonly image: Raster; readonly footprint: Uint8Array } {
  return withMats((made) => {
    const source = made(rasterMat(cv, image))
    const matrix = made(cv.matFromArray(3, 3, cv.CV_64F, homography))
    const target = made(new cv.Mat())
    const frame = new cv.Size(size.width, size.height)
    cv.warpPerspective(source, target, matrix, frame, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0))
    const footprint = made(new cv.Mat())
    cv.warpPerspective(made(new cv.Mat(image.height, image.width, cv.CV_8UC1, new cv.Scalar(255))), footprint, matrix, frame, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0))
    return { image: { data: Uint8Array.from(target.data), width: size.width, height: size.height, channels: image.channels }, footprint: Uint8Array.from(footprint.data) }
  })
}
