import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'

// The model sees each photograph at no more than this many pixels on its long edge. A phone photograph is larger,
// and sending it whole only costs more, because the service scales it down.
const LONG_EDGE_PIXELS = 2048
const JPEG_QUALITY = 90

export type PreparedPhoto = {
  readonly path: string
  // Of the original file, so a result can be matched to the exact photograph it came from.
  readonly sha256: string
  readonly width: number
  readonly height: number
  readonly base64: string
}

export async function preparePhoto(path: string): Promise<PreparedPhoto> {
  const original = await readFile(path)
  // rotate() with no angle applies the camera's orientation. Metadata, including location, is not carried over.
  const { data, info } = await sharp(original)
    .rotate()
    .resize({ width: LONG_EDGE_PIXELS, height: LONG_EDGE_PIXELS, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer({ resolveWithObject: true })
  return {
    path,
    sha256: createHash('sha256').update(original).digest('hex'),
    width: info.width,
    height: info.height,
    base64: data.toString('base64'),
  }
}
