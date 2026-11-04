import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { readyOpenCv } from './measure.ts'
import type { Mat as MeasuredMat, OpenCv } from './measure.ts'

// The part of OpenCV.js that aligning and comparing a pair uses. Its bundled type definitions describe the C++ API
// rather than these bindings, so the few calls are typed here, as measure.ts does for measuring.

export type Mat = MeasuredMat & { readonly data32S: Int32Array; readonly data64F: Float64Array }
type Vector<T> = { size(): number; get(index: number): T; delete(): void }
type KeyPoint = { readonly pt: { readonly x: number; readonly y: number } }
type Match = { readonly queryIdx: number; readonly trainIdx: number; readonly distance: number }

export type PairCv = Omit<OpenCv, 'Mat'> & {
  readonly Mat: { new (): Mat; new (rows: number, columns: number, type: number, value?: object): Mat }
  readonly Scalar: new (...values: number[]) => object
  readonly KeyPointVector: new () => Vector<KeyPoint>
  readonly DMatchVectorVector: new () => Vector<Vector<Match>>
  readonly ORB: new (features: number) => { detectAndCompute(image: Mat, mask: Mat, keypoints: Vector<KeyPoint>, descriptors: Mat): void; delete(): void }
  readonly BFMatcher: new (norm: number, crossCheck: boolean) => { knnMatch(query: Mat, train: Mat, matches: Vector<Vector<Match>>, k: number): void; delete(): void }
  readonly CV_8UC1: number
  readonly CV_8UC3: number
  readonly CV_8UC4: number
  readonly CV_32FC2: number
  readonly NORM_HAMMING: number
  readonly USAC_MAGSAC: number
  readonly INTER_LINEAR: number
  readonly BORDER_CONSTANT: number
  readonly MORPH_RECT: number
  matFromArray(rows: number, columns: number, type: number, values: readonly number[]): Mat
  findHomography(source: Mat, target: Mat, method: number, threshold: number, mask: Mat): Mat
  warpPerspective(source: Mat, target: Mat, matrix: Mat, size: object, flags: number, border: number, value: object): void
  GaussianBlur(source: Mat, target: Mat, size: object, sigma: number): void
  erode(source: Mat, target: Mat, kernel: Mat): void
  dilate(source: Mat, target: Mat, kernel: Mat): void
  getStructuringElement(shape: number, size: object): Mat
  connectedComponentsWithStats(source: Mat, labels: Mat, stats: Mat, centroids: Mat): number
}

// Both photographs may arrive while WebAssembly is initializing; share its one initialization callback. Required, not
// imported: an import of OpenCV.js is taken for a promise and never settles (see readyOpenCv).
let runtime: Promise<{ readonly cv: PairCv }> | undefined
export const pairCv = () => runtime ??= readyOpenCv(createRequire(requireFrom())('@techstark/opencv-js')).then((ready) => ({ cv: ready.cv as PairCv }))

// Where OpenCV.js is looked up from: this file, or, once a bundler has written this file's path as one that exists only
// while building (Next.js writes "/ROOT/packages/..."), the running app's own dependencies, which name it (apps/web).
function requireFrom(): string {
  const here = typeof __filename === 'string' ? __filename : import.meta.url
  return here.startsWith('file:') || existsSync(here) ? here : join(process.cwd(), 'package.json')
}

// Runs work with OpenCV matrices and frees every one it made, whatever happens.
export function withMats<T>(work: (made: <M extends { delete(): void }>(value: M) => M) => T): T {
  const all: { delete(): void }[] = []
  try {
    return work((value) => {
      all.push(value)
      return value
    })
  } finally {
    for (const each of all) each.delete()
  }
}

// Pixels row by row, with one (grey), three (RGB) or four (RGBA) values each.
export type Raster = { readonly data: Uint8Array; readonly width: number; readonly height: number; readonly channels: 1 | 3 | 4 }

export function rasterMat(cv: PairCv, image: Raster): Mat {
  const mat = new cv.Mat(image.height, image.width, image.channels === 1 ? cv.CV_8UC1 : image.channels === 3 ? cv.CV_8UC3 : cv.CV_8UC4)
  mat.data.set(image.data)
  return mat
}
