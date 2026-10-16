import type { PhotoMeasures } from '@hold/domain'

// What the phone measures on a photograph before it uploads (architecture.md section 9.1): sharpness, brightness and
// how much of the frame the item fills. OpenCV.js runs in a worker on the phone; it is passed in, so this runs the
// same in a test. The domain's checkPhotoQuality decides what the measures mean.

type Mat = {
  readonly rows: number
  readonly cols: number
  readonly data: Uint8Array
  doubleAt(row: number, column: number): number
  delete(): void
}

// The part of OpenCV.js this uses.
export type OpenCv = {
  readonly Mat: new () => Mat
  readonly Size: new (width: number, height: number) => object
  readonly COLOR_RGBA2GRAY: number
  readonly INTER_AREA: number
  readonly CV_64F: number
  matFromImageData(image: { readonly data: Uint8ClampedArray; readonly width: number; readonly height: number }): Mat
  cvtColor(source: Mat, target: Mat, code: number): void
  resize(source: Mat, target: Mat, size: object, fx: number, fy: number, interpolation: number): void
  Laplacian(source: Mat, target: Mat, depth: number): void
  meanStdDev(source: Mat, mean: Mat, deviation: Mat): void
  Canny(source: Mat, target: Mat, low: number, high: number): void
}

type Runtime = OpenCv & { onRuntimeInitialized?: () => void }

// OpenCV.js compiles its WebAssembly after it loads. Its module has a `then` that resolves to itself, so neither it nor
// a promise resolved with it may ever be awaited: the module is taken as it is, and given back inside an object.
export function readyOpenCv(module: unknown): Promise<{ readonly cv: OpenCv }> {
  const runtime = module as Runtime
  if (typeof runtime.Mat === 'function') return Promise.resolve({ cv: runtime })
  return new Promise((resolve) => {
    runtime.onRuntimeInitialized = () => {
      resolve({ cv: runtime })
    }
  })
}

// Measured on a grey copy this many pixels wide, so every phone's photograph is judged at one scale.
const MEASURE_WIDTH = 640
// Shadows and highlights are the grey levels this share of the photograph lies below and above.
const TAIL = 0.05
// The edges between these share of the outermost ones count, so a stray speck at the border does not.
const EDGE_TRIM = 0.02

export function measurePhoto(cv: OpenCv, image: { readonly data: Uint8ClampedArray; readonly width: number; readonly height: number }): PhotoMeasures {
  const made: Mat[] = []
  const mat = () => {
    const created = new cv.Mat()
    made.push(created)
    return created
  }
  try {
    const source = cv.matFromImageData(image)
    made.push(source)
    const grey = mat()
    cv.cvtColor(source, grey, cv.COLOR_RGBA2GRAY)
    const small = mat()
    cv.resize(grey, small, new cv.Size(MEASURE_WIDTH, Math.max(1, Math.round((image.height * MEASURE_WIDTH) / image.width))), 0, 0, cv.INTER_AREA)

    const laplacian = mat()
    cv.Laplacian(small, laplacian, cv.CV_64F)
    const mean = mat()
    const deviation = mat()
    cv.meanStdDev(laplacian, mean, deviation)
    const spread = deviation.doubleAt(0, 0)

    const edges = mat()
    cv.Canny(small, edges, 50, 150)
    const levels = [...small.data].sort((first, second) => first - second)
    const at = (share: number) => levels[Math.min(levels.length - 1, Math.floor(levels.length * share))] ?? 0
    return { sharpness: spread * spread, shadows: at(TAIL), highlights: at(1 - TAIL), filled: edgeArea(edges) }
  } finally {
    for (const each of made) each.delete()
  }
}

// The share of the frame inside the box that holds the item's edges, trimmed of stray ones.
function edgeArea(edges: Mat): number {
  const xs: number[] = []
  const ys: number[] = []
  for (let row = 0; row < edges.rows; row += 1) {
    for (let column = 0; column < edges.cols; column += 1) {
      if ((edges.data[row * edges.cols + column] ?? 0) > 0) {
        xs.push(column)
        ys.push(row)
      }
    }
  }
  if (xs.length === 0) return 0
  const span = (values: number[]) => {
    values.sort((first, second) => first - second)
    const low = values[Math.floor(values.length * EDGE_TRIM)] ?? 0
    const high = values[Math.ceil(values.length * (1 - EDGE_TRIM)) - 1] ?? 0
    return high - low
  }
  return (span(xs) * span(ys)) / (edges.cols * edges.rows)
}
