import type { Region } from '@hold/domain'
import sharp from 'sharp'

// The copy of a photograph people see (architecture.md section 9.3): upright, at most this many pixels on its longest
// side, faces blurred, and none of the phone's metadata, such as where it was taken. The original stays locked.
export const DISPLAY_LONGEST_SIDE = 1600

// A face is blurred with this much room around what was found, so an ear or a chin does not show at its edge.
const FACE_MARGIN = 0.15
const QUALITY = 80

export async function displayCopy(original: Buffer, faces: readonly Region[]): Promise<Buffer> {
  const { data, info } = await sharp(original)
    .rotate()
    .resize({ width: DISPLAY_LONGEST_SIDE, height: DISPLAY_LONGEST_SIDE, fit: 'inside', withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true })
  const blurred = []
  for (const face of faces) {
    const left = Math.max(0, Math.floor((face.x - face.width * FACE_MARGIN) * info.width))
    const top = Math.max(0, Math.floor((face.y - face.height * FACE_MARGIN) * info.height))
    const width = Math.min(info.width - left, Math.ceil(face.width * (1 + 2 * FACE_MARGIN) * info.width))
    const height = Math.min(info.height - top, Math.ceil(face.height * (1 + 2 * FACE_MARGIN) * info.height))
    if (width < 2 || height < 2) continue
    const patch = await sharp(data).extract({ left, top, width, height }).blur(Math.max(10, Math.min(width, height) / 4)).toBuffer()
    blurred.push({ input: patch, left, top })
  }
  return sharp(data).composite(blurred).jpeg({ quality: QUALITY }).toBuffer()
}

// A 64-bit difference hash: which of each pair of neighbouring cells is brighter, on a 9 by 8 grey thumbnail. Close
// fingerprints mean the same picture, however it was resized or compressed; it flags a photograph used again.
export async function perceptualHash(image: Buffer): Promise<string> {
  const pixels = await sharp(image).rotate().greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer()
  let bits = 0n
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const here = pixels[row * 9 + column] ?? 0
      const next = pixels[row * 9 + column + 1] ?? 0
      bits = (bits << 1n) | (here > next ? 1n : 0n)
    }
  }
  return bits.toString(16).padStart(16, '0')
}
