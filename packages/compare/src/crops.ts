import type { Region } from '@hold/domain'
import type { PreparedPair } from '@hold/vision/inspect-pair'
import sharp from 'sharp'

async function crop(image: Buffer, region: Region, margin: number, offset = { x: 0, y: 0 }) {
  const metadata = await sharp(image).metadata()
  const width = metadata.width; const height = metadata.height
  const left = Math.max(0, Math.floor((region.x - offset.x - margin) * width))
  const top = Math.max(0, Math.floor((region.y - offset.y - margin) * height))
  const right = Math.min(width, Math.ceil((region.x + region.width - offset.x + margin) * width))
  const bottom = Math.min(height, Math.ceil((region.y + region.height - offset.y + margin) * height))
  return sharp(image).extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }).jpeg().toBuffer()
}

// margin: how much of the photograph around the region each crop keeps, as a fraction of the photograph.
export async function pairedCrops(pair: PreparedPair, region: Region, margin = 0.03) {
  const [before, after] = await Promise.all([crop(pair.before, region, margin, pair.offset), crop(pair.after, region, margin)])
  return [{ label: 'Handover crop', body: before }, { label: 'Return crop', body: after }]
}
