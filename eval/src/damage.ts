import type { Region } from '@hold/domain'
import sharp from 'sharp'
import type { OverlayOptions } from 'sharp'
import { z } from 'zod'

// Synthetic damage for the evaluation set (extensions.md section 5.3). Damage is drawn from the photograph's own pixels,
// so it keeps the light that falls on the item: bare metal is darker in shadow and brighter where lit, a scratch
// lightens the paint it cuts, a crack darkens it. A flat patch of colour reads as a sticker or an edit, and the
// comparison rightly refuses to call it damage (the run of 29 October 2026). A missing part cannot be drawn
// believably, so the set has no missing-part pairs: a scuff stands in as the fifth kind.

export type DamageKind = 'scratch' | 'dent' | 'crack' | 'chip' | 'scuff'
export const DAMAGE_KINDS: readonly DamageKind[] = ['scratch', 'dent', 'crack', 'chip', 'scuff']
export type DamageSpec = { readonly kind: DamageKind; readonly size: 'small' | 'large' }
export type Drawn = { readonly image: Buffer; readonly region: Region; readonly center: { readonly x: number; readonly y: number } }

type Point = readonly [number, number]
type Box = { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
type Blend = 'multiply' | 'screen' | 'overlay'
// How the damage is made: the surface it exposes (from the photograph's own pixels, shown through a mask), and the
// edges and lines laid over it.
type Surface = { readonly mask: string; readonly make: (patch: Buffer) => Promise<Buffer> }
type Recipe = { readonly outline: readonly Point[]; readonly reach: number; readonly surfaces: readonly Surface[]; readonly overlays: readonly { readonly svg: string; readonly blend: Blend }[] }

const between = (random: () => number, low: number, high: number) => low + random() * (high - low)
const pointList = (points: readonly Point[]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
const turned = (points: readonly Point[], cx: number, cy: number, angle: number): Point[] => points.map(([x, y]) => {
  const dx = x - cx; const dy = y - cy
  return [cx + dx * Math.cos(angle) - dy * Math.sin(angle), cy + dx * Math.sin(angle) + dy * Math.cos(angle)] as const
})

// The places a mask marks as the item, on a grid of the given size, kept clear of the edge the variance window needs.
// A mask is a photograph of the same view where white is the item and black is everything else.
async function itemPlaces(mask: Buffer, width: number, height: number): Promise<{ x: number; y: number }[]> {
  const { data } = await sharp(mask).greyscale().resize({ width, height, fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  const places: { x: number; y: number }[] = []
  for (let y = 4; y < height - 4; y += 1) for (let x = 4; x < width - 4; x += 1) if ((data[y * width + x] ?? 0) > 127) places.push({ x: (x + 0.5) / width, y: (y + 0.5) / height })
  if (places.length === 0) throw new Error('The mask marks no part of the item.')
  return places
}

// Where the photograph has most detail: damage belongs on the item, not on the wall behind it. Without a mask, detail
// stands in for the item, which holds against a plain counter but not against a brick wall or a fence.
async function busiestPlace(photo: Buffer, random: () => number, within?: Buffer): Promise<{ x: number; y: number }> {
  const { data, info } = await sharp(photo).greyscale().resize({ width: 96 }).raw().toBuffer({ resolveWithObject: true })
  const places = within === undefined ? undefined : await itemPlaces(within, info.width, info.height)
  let best = { x: 0.5, y: 0.5, score: -1 }
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const place = places === undefined ? { x: between(random, 0.2, 0.8), y: between(random, 0.2, 0.8) } : places[Math.floor(random() * places.length)]
    if (place === undefined) continue
    const { x, y } = place
    const cx = Math.round(x * info.width)
    const cy = Math.round(y * info.height)
    let sum = 0; let squares = 0; let count = 0
    for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
      const value = data[(cy + dy) * info.width + (cx + dx)] ?? 0
      sum += value; squares += value * value; count += 1
    }
    const variance = squares / count - (sum / count) ** 2
    if (variance > best.score) best = { x, y, score: variance }
  }
  return { x: best.x, y: best.y }
}

// An outline whose radius wanders and breaks off in small bites, as flaking paint does.
function ragged(cx: number, cy: number, radius: number, stretch: number, angle: number, random: () => number): Point[] {
  let wander = 1
  const outline = Array.from({ length: 28 }, (_, index) => {
    wander = Math.min(1.25, Math.max(0.6, wander + between(random, -0.16, 0.16)))
    const bite = random() < 0.22 ? between(random, 0.72, 0.9) : 1
    const turn = (index / 28) * Math.PI * 2
    return [cx + Math.cos(turn) * radius * wander * bite * stretch, cy + Math.sin(turn) * radius * wander * bite / stretch] as const
  })
  return turned(outline, cx, cy, angle)
}

// A line along the given angle, wandering by the given amount.
function wandering(cx: number, cy: number, length: number, angle: number, jitter: number, count: number, random: () => number): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const along = (index / (count - 1) - 0.5) * length
    return [cx + Math.cos(angle) * along + between(random, -jitter, jitter), cy + Math.sin(angle) * along + between(random, -jitter, jitter)] as const
  })
}

// Bare metal under paint: the photograph's own light, without its colour, lifted towards aluminium grey, with grain.
async function bareMetal(patch: Buffer, seed: number): Promise<Buffer> {
  const { width, height } = await sharp(patch).metadata()
  const metal = await sharp(patch).greyscale().linear(0.55, 70).toColourspace('srgb').png().toBuffer()
  const grain = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${String(seed)}"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#g)" opacity="0.45"/></svg>`)
  return sharp(metal).composite([{ input: grain, blend: 'overlay' }]).png().toBuffer()
}

function chip(cx: number, cy: number, extent: number, angle: number, random: () => number): Recipe {
  const outline = ragged(cx, cy, extent * 0.3, between(random, 1, 1.5), angle, random)
  // Where the paint breaks, a ring of pale primer shows between the paint and the metal.
  const primer = outline.map(([x, y]) => [cx + (x - cx) * 1.18, cy + (y - cy) * 1.18] as const)
  const rim = Math.max(1.2, extent * 0.02)
  const seed = Math.floor(random() * 1000)
  return {
    outline: primer, reach: rim + 3,
    surfaces: [
      { mask: `<polygon points="${pointList(primer)}" fill="#fff"/>`, make: (patch) => sharp(patch).modulate({ saturation: 0.15, brightness: 1.2 }).png().toBuffer() },
      { mask: `<polygon points="${pointList(outline)}" fill="#fff"/>`, make: (patch) => bareMetal(patch, seed) },
    ],
    overlays: [
      // The broken edge of the paint layer: shadowed on one side, catching light on the other.
      { svg: `<polygon points="${pointList(primer.map(([x, y]) => [x + 0.8, y + 0.8]))}" fill="none" stroke="#2b1d05" stroke-width="${rim.toFixed(1)}" stroke-opacity="0.55"/>`, blend: 'multiply' },
      { svg: `<polygon points="${pointList(outline)}" fill="none" stroke="#4a4a48" stroke-width="1" stroke-opacity="0.5"/>`, blend: 'multiply' },
      // The tube is round: the bared metal darkens towards one side, as the paint around it does.
      { svg: `<defs><linearGradient id="t" gradientUnits="userSpaceOnUse" x1="${(cx + Math.sin(angle) * extent * 0.35).toFixed(1)}" y1="${(cy - Math.cos(angle) * extent * 0.35).toFixed(1)}" x2="${(cx - Math.sin(angle) * extent * 0.35).toFixed(1)}" y2="${(cy + Math.cos(angle) * extent * 0.35).toFixed(1)}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#7a7a7a"/></linearGradient><clipPath id="m"><polygon points="${pointList(outline)}"/></clipPath></defs><polygon points="${pointList(outline)}" fill="url(#t)" clip-path="url(#m)"/>`, blend: 'multiply' },
    ],
  }
}

function scuff(cx: number, cy: number, extent: number, angle: number, random: () => number): Recipe {
  const outline = ragged(cx, cy, extent * 0.4, 1.7, angle, random)
  const soft = extent * 0.06
  // Fine parallel scratches across the abraded patch, all one way, as from one scrape.
  const lines = Array.from({ length: 18 }, () => {
    const offset = between(random, -extent * 0.3, extent * 0.3)
    const centre: Point = [cx - Math.sin(angle) * offset, cy + Math.cos(angle) * offset]
    return wandering(centre[0], centre[1], extent * between(random, 0.3, 0.8), angle, 0.4, 4, random)
  })
  return {
    outline, reach: soft * 3 + 2,
    surfaces: [{
      mask: `<filter id="s"><feGaussianBlur stdDeviation="${soft.toFixed(1)}"/></filter><polygon points="${pointList(outline)}" fill="#fff" filter="url(#s)"/>`,
      make: (patch) => sharp(patch).modulate({ saturation: 0.45, brightness: 1.15 }).linear(0.85, 28).png().toBuffer(),
    }],
    overlays: [{ svg: `<clipPath id="c"><polygon points="${pointList(outline)}"/></clipPath><g clip-path="url(#c)">${lines.map((line) => `<polyline points="${pointList(line)}" fill="none" stroke="#fff" stroke-width="0.8" stroke-opacity="0.5"/>`).join('')}</g>`, blend: 'screen' }],
  }
}

function scratch(cx: number, cy: number, extent: number, angle: number, random: () => number): Recipe {
  const path = wandering(cx, cy, extent * 1.3, angle, extent * 0.015, 9, random)
  const width = Math.max(1.2, extent * 0.018)
  const shadow = path.map(([x, y]) => [x - Math.sin(angle) * width * 0.8, y + Math.cos(angle) * width * 0.8] as const)
  // A scrape skips where the surface dips: the line breaks once or twice along its length.
  const dashes = `${(extent * between(random, 0.35, 0.6)).toFixed(1)} ${(extent * between(random, 0.03, 0.08)).toFixed(1)}`
  return {
    outline: path, reach: width * 2 + 2,
    surfaces: [{
      mask: `<filter id="b"><feGaussianBlur stdDeviation="0.4"/></filter><polyline points="${pointList(path)}" fill="none" stroke="#fff" stroke-width="${width.toFixed(1)}" stroke-linecap="round" stroke-dasharray="${dashes}" filter="url(#b)"/>`,
      make: (patch) => sharp(patch).modulate({ saturation: 0.35, brightness: 1.3 }).linear(1, 12).png().toBuffer(),
    }],
    overlays: [{ svg: `<polyline points="${pointList(shadow)}" fill="none" stroke="#1c1404" stroke-width="${(width * 0.5).toFixed(1)}" stroke-opacity="0.4" stroke-linecap="round" stroke-dasharray="${dashes}"/>`, blend: 'multiply' }],
  }
}

function crack(cx: number, cy: number, extent: number, angle: number, random: () => number): Recipe {
  const path = wandering(cx, cy, extent, angle, extent * 0.035, 14, random)
  const fork = path[4] ?? [cx, cy]
  const branch = wandering(fork[0] + Math.cos(angle + 0.7) * extent * 0.15, fork[1] + Math.sin(angle + 0.7) * extent * 0.15, extent * 0.3, angle + 0.7, extent * 0.03, 4, random)
  const width = Math.max(1.4, extent * 0.015)
  const lines = `<polyline points="${pointList(path)}" fill="none" stroke="#fff" stroke-width="${width.toFixed(1)}"/><polyline points="${pointList([fork, ...branch])}" fill="none" stroke="#fff" stroke-width="${(width * 0.7).toFixed(1)}"/>`
  return {
    outline: [...path, ...branch], reach: width * 2 + 2,
    surfaces: [{ mask: `<filter id="b"><feGaussianBlur stdDeviation="0.35"/></filter><g filter="url(#b)">${lines}</g>`, make: (patch) => sharp(patch).modulate({ brightness: 0.28 }).png().toBuffer() }],
    overlays: [{ svg: `<polyline points="${pointList(path.map(([x, y]) => [x - 1, y - 1]))}" fill="none" stroke="#fffbe6" stroke-width="1" stroke-opacity="0.25"/>`, blend: 'screen' }],
  }
}

// A dent changes no colour, only how the light falls: a shadowed hollow on one side, a highlight on its far rim.
function dent(cx: number, cy: number, extent: number, angle: number): Recipe {
  const rx = extent * 0.5; const ry = extent * 0.32
  const degrees = ((angle * 180) / Math.PI).toFixed(1)
  const outline = turned([[cx - rx, cy - ry], [cx + rx, cy - ry], [cx + rx, cy + ry], [cx - rx, cy + ry]], cx, cy, angle)
  const ellipse = (dx: number, scale: number, fill: string) => `<ellipse cx="${(cx + dx).toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(rx * scale).toFixed(1)}" ry="${(ry * scale).toFixed(1)}" fill="${fill}" transform="rotate(${degrees} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`
  return {
    outline, reach: 4, surfaces: [],
    overlays: [
      { svg: `<defs><radialGradient id="d"><stop offset="0" stop-color="#000" stop-opacity="0.32"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>${ellipse(rx * 0.15, 1, 'url(#d)')}`, blend: 'multiply' },
      { svg: `<defs><radialGradient id="h"><stop offset="0" stop-color="#fff" stop-opacity="0.5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>${ellipse(-rx * 0.45, 0.45, 'url(#h)')}`, blend: 'screen' },
    ],
  }
}

// The smallest box, inside the photograph, that holds the outline and what spreads beyond it.
function boxAround(outline: readonly Point[], reach: number, width: number, height: number): Box {
  const xs = outline.map(([x]) => x); const ys = outline.map(([, y]) => y)
  const left = Math.max(0, Math.floor(Math.min(...xs) - reach))
  const top = Math.max(0, Math.floor(Math.min(...ys) - reach))
  const right = Math.min(width, Math.ceil(Math.max(...xs) + reach))
  const bottom = Math.min(height, Math.ceil(Math.max(...ys) + reach))
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
}

const inBox = (box: Box, content: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${String(box.width)}" height="${String(box.height)}"><g transform="translate(${String(-box.left)} ${String(-box.top)})">${content}</g></svg>`)

// Draws one kind of damage at the given centre, or at a place with detail inside the item's mask, and returns its
// exact region: the box it changed, and nothing outside it.
export async function drawDamage(photo: Buffer, spec: DamageSpec, random: () => number, at?: { readonly x: number; readonly y: number }, within?: Buffer): Promise<Drawn> {
  const { width, height } = await sharp(photo).metadata()
  const center = at ?? await busiestPlace(photo, random, within)
  const extent = width * (spec.size === 'small' ? between(random, 0.04, 0.07) : between(random, 0.1, 0.16))
  const cx = center.x * width
  const cy = center.y * height
  const angle = between(random, 0, Math.PI)
  const recipe = spec.kind === 'chip' ? chip(cx, cy, extent, angle, random)
    : spec.kind === 'scuff' ? scuff(cx, cy, extent, angle, random)
      : spec.kind === 'scratch' ? scratch(cx, cy, extent, angle, random)
        : spec.kind === 'crack' ? crack(cx, cy, extent, angle, random)
          : dent(cx, cy, extent, angle)
  const box = boxAround(recipe.outline, recipe.reach, width, height)
  const layers: OverlayOptions[] = []
  const patch = await sharp(photo).extract(box).png().toBuffer()
  for (const surface of recipe.surfaces) {
    const made = await sharp(await surface.make(patch)).ensureAlpha().composite([{ input: inBox(box, surface.mask), blend: 'dest-in' }]).png().toBuffer()
    layers.push({ input: made, left: box.left, top: box.top })
  }
  for (const overlay of recipe.overlays) layers.push({ input: inBox(box, overlay.svg), left: box.left, top: box.top, blend: overlay.blend })
  const damaged = await sharp(photo).composite(layers).png().toBuffer()
  if (within === undefined) return { image: await sharp(damaged).jpeg({ quality: 92 }).toBuffer(), center, region: fraction(box, width, height) }
  // Damage stops where the item stops: only the part of the box the mask marks as the item is changed.
  const alpha = await sharp(within).resize({ width, height, fit: 'fill' }).extract(box).greyscale().raw().toBuffer()
  // In two steps: within one pipeline sharp joins the channel before it extracts the box.
  const cut = await sharp(damaged).extract(box).removeAlpha().png().toBuffer()
  const piece = await sharp(cut).joinChannel(alpha, { raw: { width: box.width, height: box.height, channels: 1 } }).png().toBuffer()
  const image = await sharp(photo).composite([{ input: piece, left: box.left, top: box.top }]).jpeg({ quality: 92 }).toBuffer()
  return { image, center, region: fraction(markedPart(box, alpha), width, height) }
}

const fraction = (box: Box, width: number, height: number): Region => ({ x: box.left / width, y: box.top / height, width: box.width / width, height: box.height / height })

// The part of a box the mask marks as the item, so the label covers what was changed and nothing more.
function markedPart(box: Box, alpha: Buffer): Box {
  let left = box.width; let top = box.height; let right = -1; let bottom = -1
  for (let y = 0; y < box.height; y += 1) for (let x = 0; x < box.width; x += 1) {
    if ((alpha[y * box.width + x] ?? 0) < 128) continue
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
  }
  if (right < 0) return box
  return { left: box.left + left, top: box.top + top, width: right - left + 1, height: bottom - top + 1 }
}

// Photographs of real damage, cut from freely licensed photographs (eval/raw/damage/sources.json, eval/raw/SOURCES.md).
// A licence must let Hold change the photograph and share the result, commercially too: no NC and no ND licences.
const FREE_LICENCE = /^(CC0|Public domain|CC BY(-SA)? [0-9.]+)$/
const damagePatchSource = z.strictObject({
  file: z.string().regex(/^[\w-]+\.png$/),
  kind: z.enum(['scratch', 'chip']),
  shows: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  licence: z.string().regex(FREE_LICENCE),
  licenceUrl: z.url(),
  source: z.string().startsWith('https://commons.wikimedia.org/wiki/File:'),
  // The part of the original the patch was cut from, as fractions: left, top, right, bottom.
  crop: z.tuple([z.number(), z.number(), z.number(), z.number()]),
})
export type DamagePatchSource = z.infer<typeof damagePatchSource>
export function damagePatchSources(data: unknown): DamagePatchSource[] {
  return z.array(damagePatchSource).min(1).parse(data)
}

// One cut photograph of damage: the damage opaque, the paint it was on transparent.
export type DamagePatch = { readonly name: string; readonly kind: DamagePatchSource['kind']; readonly image: Buffer }

const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b

// Pastes a photograph of real damage onto the item, turned, mirrored and sized at random, and returns the region it
// changed. The damage takes on the light where it lands: its brightness is scaled by how bright the item is there
// against how bright the paint around it was in its own photograph. Only what the mask marks as the item changes, and a
// place where most of the damage would fall off the item is passed over for another, so no label covers a sliver.
const WHOLE_ON_ITEM = 0.85
const PLACES_TRIED = 12

export async function pasteDamage(photo: Buffer, patch: DamagePatch, size: DamageSpec['size'], random: () => number, at?: { readonly x: number; readonly y: number }, within?: Buffer): Promise<Drawn & { readonly onItem: number }> {
  const { width, height } = await sharp(photo).metadata()
  const extent = Math.max(8, Math.round(width * (size === 'small' ? between(random, 0.05, 0.08) : between(random, 0.11, 0.17))))
  const angle = between(random, 0, 360)
  const mirrored = random() < 0.5
  const turned = await sharp(patch.image).ensureAlpha().rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  const flipped = mirrored ? await sharp(turned).flop().png().toBuffer() : turned
  const piece = await sharp(flipped).resize({ width: extent, height: Math.min(extent, height), fit: 'inside' }).raw().toBuffer({ resolveWithObject: true })
  const item = within === undefined ? undefined : await sharp(within).resize({ width, height, fit: 'fill' }).greyscale().raw().toBuffer()
  const placed = (center: { readonly x: number; readonly y: number }) => placePatch(photo, { width, height }, piece, item, center)
  let best = await placed(at ?? await busiestPlace(photo, random, within))
  for (let tried = 1; at === undefined && item !== undefined && tried < PLACES_TRIED && best.onItem < WHOLE_ON_ITEM; tried += 1) {
    const next = await placed(await busiestPlace(photo, random, within))
    if (next.onItem > best.onItem) best = next
  }
  const image = await sharp(photo).removeAlpha().composite([{ input: best.out, raw: { width: best.box.width, height: best.box.height, channels: 3 }, left: best.box.left, top: best.box.top }]).jpeg({ quality: 92 }).toBuffer()
  return { image, center: best.center, region: fraction(best.changed, width, height), onItem: best.onItem }
}

// The patch blended into the photograph at one place, before anything is saved: the pixels, the box they go in, the
// region the damage covers and how much of the damage landed on the item.
async function placePatch(photo: Buffer, size: { readonly width: number; readonly height: number }, piece: { readonly data: Buffer; readonly info: { readonly width: number; readonly height: number } }, item: Buffer | undefined, center: { readonly x: number; readonly y: number }) {
  const { width: pieceWidth, height: pieceHeight } = piece.info
  const left = Math.min(Math.max(0, Math.round(center.x * size.width - pieceWidth / 2)), size.width - pieceWidth)
  const top = Math.min(Math.max(0, Math.round(center.y * size.height - pieceHeight / 2)), size.height - pieceHeight)
  const box = { left, top, width: pieceWidth, height: pieceHeight }
  const target = await sharp(photo).removeAlpha().extract(box).raw().toBuffer()
  const pixels = pieceWidth * pieceHeight
  const onItemAt = (index: number) => item === undefined ? 1 : (item[(top + Math.floor(index / pieceWidth)) * size.width + left + (index % pieceWidth)] ?? 0) / 255
  let lit = 0; let paint = 0; let paintCount = 0; let damage = 0; let damageCount = 0; let landed = 0
  for (let index = 0; index < pixels; index += 1) {
    lit += luminance(target[index * 3] ?? 0, target[index * 3 + 1] ?? 0, target[index * 3 + 2] ?? 0)
    const [r, g, b, a] = [0, 1, 2, 3].map((channel) => piece.data[index * 4 + channel] ?? 0) as [number, number, number, number]
    // The turn fills the corners with nothing: neither paint nor damage.
    if (a < 26 && r + g + b > 0) { paint += luminance(r, g, b); paintCount += 1 } else if (a >= 128) { damage += luminance(r, g, b); damageCount += 1; if (onItemAt(index) >= 0.5) landed += 1 }
  }
  const surround = paintCount > 0 ? paint / paintCount : damage / Math.max(1, damageCount)
  const gain = Math.min(1.6, Math.max(0.45, lit / pixels / Math.max(1, surround)))
  const out = Buffer.alloc(pixels * 3)
  let minX = pieceWidth; let minY = pieceHeight; let maxX = -1; let maxY = -1
  for (let index = 0; index < pixels; index += 1) {
    const weight = ((piece.data[index * 4 + 3] ?? 0) / 255) * onItemAt(index)
    for (let channel = 0; channel < 3; channel += 1) {
      const before = target[index * 3 + channel] ?? 0
      const pasted = Math.min(255, (piece.data[index * 4 + channel] ?? 0) * gain)
      out[index * 3 + channel] = Math.round(before * (1 - weight) + pasted * weight)
    }
    if (weight >= 0.25) {
      const x = index % pieceWidth; const y = Math.floor(index / pieceWidth)
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    }
  }
  const changed = maxX < 0 ? box : { left: left + minX, top: top + minY, width: maxX - minX + 1, height: maxY - minY + 1 }
  return { out, box, changed, center, onItem: landed / Math.max(1, damageCount) }
}
