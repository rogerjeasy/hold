// A photograph as the handover needs it: the JPEG to store, and a smaller copy of its pixels to measure. Measured at
// most this wide, so a 12-megapixel photograph is not copied whole to the quality worker.
const MEASURE_WIDTH = 1280
const JPEG_QUALITY = 0.92

export type ReadImage = { readonly blob: Blob; readonly pixels: ImageData }

function canvasOf(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('No canvas.')
  return [canvas, context]
}

function measured(source: CanvasImageSource, width: number, height: number): ImageData {
  const scale = Math.min(1, MEASURE_WIDTH / width)
  const [, context] = canvasOf(Math.round(width * scale), Math.round(height * scale))
  context.drawImage(source, 0, 0, Math.round(width * scale), Math.round(height * scale))
  return context.getImageData(0, 0, Math.round(width * scale), Math.round(height * scale))
}

// A file the phone chose, or the sample: stored as it is, measured from its pixels.
export async function readImage(source: Blob): Promise<ReadImage> {
  const bitmap = await createImageBitmap(source)
  try {
    return { blob: source, pixels: measured(bitmap, bitmap.width, bitmap.height) }
  } finally {
    bitmap.close()
  }
}

// The camera's current frame, at the camera's full size.
export async function readFrame(video: HTMLVideoElement): Promise<ReadImage> {
  const [canvas, context] = canvasOf(video.videoWidth, video.videoHeight)
  context.drawImage(video, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  })
  if (blob === null) throw new Error('The frame could not be read.')
  return { blob, pixels: measured(canvas, canvas.width, canvas.height) }
}
