import type { Region } from '@hold/domain'
import type { PreparedPair } from '@hold/vision/inspect-pair'
import sharp from 'sharp'

async function crop(image: Buffer, region: Region, margin: number) {
  const metadata = await sharp(image).metadata()
  const width = metadata.width; const height = metadata.height
  const left = Math.max(0, Math.floor((region.x - margin) * width))
  const top = Math.max(0, Math.floor((region.y - margin) * height))
  const right = Math.min(width, Math.ceil((region.x + region.width + margin) * width))
  const bottom = Math.min(height, Math.ceil((region.y + region.height + margin) * height))
  return sharp(image).extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }).jpeg().toBuffer()
}

// A region is in the return photograph's frame. The handover crop is cut from the handover lined up on that frame, so
// both crops show the same place on the item, turned and zoomed alike.
// margin: how much of the photograph around the region each crop keeps, as a fraction of the photograph.
export async function pairedCrops(pair: PreparedPair, region: Region, margin = 0.03) {
  const [before, after] = await Promise.all([crop(pair.alignedBefore, region, margin), crop(pair.after, region, margin)])
  return [{ label: 'Handover crop', body: before }, { label: 'Return crop', body: after }]
}
