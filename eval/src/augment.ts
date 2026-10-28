import { EVALUATION_GROUPS } from '@hold/domain'
import type { EvaluationGroup, Region } from '@hold/domain'
import { mapPoint } from '@hold/vision/homography'
import { inspectPair } from '@hold/vision/inspect-pair'
import sharp from 'sharp'
import type { EvaluationCase, Half } from './manifest.ts'

// Turns real photographs of one bike into labelled pairs (extensions.md section 5.3, the hybrid set agreed on
// 26 October 2026). Every pair starts from two different real shots of one view, so a synthetic pair is never a
// copy the reuse check would catch. Damage is drawn only on the return shot, and its region is exact. Every
// synthetic pair says so in its note, and its origin is "synthetic" in the manifest, the report and the scorecard.

export type RawPhoto = { readonly bike: 'A' | 'B'; readonly session: number; readonly view: string; readonly file: string }

const RAW_NAME = /^(A|B)-s(\d)-([a-z0-9-]+)\.jpe?g$/i

export function rawCatalog(files: readonly string[]): RawPhoto[] {
  return files.flatMap((file) => {
    const match = RAW_NAME.exec(file)
    if (match === null) return []
    const [, bike, session, view] = match
    return [{ bike: bike === 'B' ? 'B' as const : 'A' as const, session: Number(session), view: (view ?? '').toLowerCase(), file }]
  })
}

// A small, seeded generator, so the same raw photographs always build the same set.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

const between = (random: () => number, low: number, high: number) => low + random() * (high - low)

export type DamageKind = 'scratch' | 'dent' | 'crack' | 'chip' | 'missing'
export const DAMAGE_KINDS: readonly DamageKind[] = ['scratch', 'dent', 'crack', 'chip', 'missing']
type DamageSpec = { readonly kind: DamageKind; readonly size: 'small' | 'large' }
type Drawn = { readonly image: Buffer; readonly region: Region; readonly center: { readonly x: number; readonly y: number } }

// Where the photograph has most detail: damage belongs on the item, not on the wall behind it.
async function busiestPlace(photo: Buffer, random: () => number): Promise<{ x: number; y: number }> {
  const { data, info } = await sharp(photo).greyscale().resize({ width: 96 }).raw().toBuffer({ resolveWithObject: true })
  let best = { x: 0.5, y: 0.5, score: -1 }
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const x = between(random, 0.2, 0.8)
    const y = between(random, 0.2, 0.8)
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

const pointList = (points: readonly (readonly [number, number])[]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

// Draws one kind of damage at a place with detail, or at the given centre, and returns its exact region.
export async function drawDamage(photo: Buffer, spec: DamageSpec, random: () => number, at?: { readonly x: number; readonly y: number }): Promise<Drawn> {
  const { width, height } = await sharp(photo).metadata()
  const center = at ?? await busiestPlace(photo, random)
  const extent = width * (spec.size === 'small' ? between(random, 0.04, 0.07) : between(random, 0.1, 0.16))
  const cx = center.x * width
  const cy = center.y * height
  const angle = between(random, 0, Math.PI)
  const line = (count: number, length: number, jitter: number) => Array.from({ length: count }, (_, index) => {
    const along = (index / (count - 1) - 0.5) * length
    return [cx + Math.cos(angle) * along + between(random, -jitter, jitter), cy + Math.sin(angle) * along + between(random, -jitter, jitter)] as const
  })
  let shapes: string
  let points: (readonly [number, number])[]
  if (spec.kind === 'scratch') {
    points = line(7, extent, extent * 0.03)
    shapes = `<polyline points="${pointList(points)}" fill="none" stroke="#e6e6e6" stroke-width="${String(Math.max(2, extent * 0.04))}" stroke-linecap="round"/><polyline points="${pointList(points.map(([x, y]) => [x + 1.5, y + 1.5]))}" fill="none" stroke="#1a1a1a" stroke-width="1.2"/>`
  } else if (spec.kind === 'crack') {
    points = line(8, extent, extent * 0.06)
    const branch = points.slice(3, 4).flatMap(([x, y]) => [[x, y], [x + extent * 0.25, y + extent * 0.2]] as const)
    shapes = `<polyline points="${pointList(points)}" fill="none" stroke="#050505" stroke-width="${String(Math.max(2, extent * 0.03))}"/><polyline points="${pointList(branch)}" fill="none" stroke="#050505" stroke-width="1.6"/>`
    points = [...points, ...branch]
  } else if (spec.kind === 'chip') {
    points = Array.from({ length: 7 }, (_, index) => {
      const turn = (index / 7) * Math.PI * 2
      const radius = extent * between(random, 0.25, 0.5)
      return [cx + Math.cos(turn) * radius, cy + Math.sin(turn) * radius] as const
    })
    shapes = `<polygon points="${pointList(points)}" fill="#a7a9ab" stroke="#2a2a2a" stroke-width="1.5"/>`
  } else if (spec.kind === 'dent') {
    const rx = extent * 0.5
    const ry = extent * 0.32
    points = [[cx - rx, cy - ry], [cx + rx, cy + ry]]
    shapes = `<defs><radialGradient id="dent"><stop offset="0" stop-color="#000" stop-opacity="0.75"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#dent)" transform="rotate(${String((angle * 180) / Math.PI)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/><ellipse cx="${(cx - rx * 0.3).toFixed(1)}" cy="${(cy - ry * 0.3).toFixed(1)}" rx="${(rx * 0.25).toFixed(1)}" ry="${(ry * 0.2).toFixed(1)}" fill="#fff" fill-opacity="0.45"/>`
  } else {
    // A part gone: the place where it was, filled with the flat colour behind it.
    const half = extent * 0.4
    points = [[cx - half, cy - half], [cx + half, cy + half]]
    shapes = `<rect x="${(cx - half).toFixed(1)}" y="${(cy - half).toFixed(1)}" width="${(half * 2).toFixed(1)}" height="${(half * 2).toFixed(1)}" rx="${(half * 0.3).toFixed(1)}" fill="#3b3d40"/><rect x="${(cx - half * 0.15).toFixed(1)}" y="${(cy - half * 0.15).toFixed(1)}" width="${(half * 0.3).toFixed(1)}" height="${(half * 0.3).toFixed(1)}" fill="#151515"/>`
  }
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">${shapes}</svg>`)
  const image = await sharp(photo).composite([{ input: svg }]).jpeg({ quality: 92 }).toBuffer()
  const pad = 6
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const left = Math.max(0, Math.min(...xs) - pad)
  const top = Math.max(0, Math.min(...ys) - pad)
  const right = Math.min(width, Math.max(...xs) + pad)
  const bottom = Math.min(height, Math.max(...ys) + pad)
  return { image, center, region: { x: left / width, y: top / height, width: (right - left) / width, height: (bottom - top) / height } }
}

// Photometric changes that leave the item as it was: light, colour, shadow, a slight tilt, sensor noise.
async function relight(photo: Buffer, random: () => number, strength: 'slight' | 'hard'): Promise<{ image: Buffer; description: string }> {
  const { width, height } = await sharp(photo).metadata()
  const brightness = strength === 'slight' ? between(random, 0.94, 1.06) : between(random, 0.7, 1.2)
  const warmth = strength === 'slight' ? 0 : between(random, -18, 18)
  let image = sharp(photo).modulate({ brightness }).linear([1 + warmth / 255, 1, 1 - warmth / 255], [0, 0, 0])
  const parts = [`brightness ${brightness.toFixed(2)}`]
  if (warmth !== 0) parts.push(`colour ${warmth > 0 ? 'warmer' : 'cooler'}`)
  if (strength === 'hard') {
    const angle = between(random, -2, 2)
    const shadow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}"><defs><linearGradient id="s" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="${between(random, 0.15, 0.35).toFixed(2)}"/><stop offset="0.6" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#s)"/></svg>`)
    const shaded = await image.composite([{ input: shadow }]).jpeg().toBuffer()
    const tilted = await sharp(shaded).rotate(angle, { background: '#000' }).toBuffer()
    const { width: tiltedWidth, height: tiltedHeight } = await sharp(tilted).metadata()
    image = sharp(tilted).extract({ left: Math.floor((tiltedWidth - width) / 2), top: Math.floor((tiltedHeight - height) / 2), width, height })
    parts.push(`shadow band`, `tilted ${angle.toFixed(1)}°`)
  }
  return { image: await image.jpeg({ quality: 90 }).toBuffer(), description: parts.join(', ') }
}

// Mud and dust: the wear policy says they are not damage.
async function dirty(photo: Buffer, random: () => number): Promise<Buffer> {
  const { width, height } = await sharp(photo).metadata()
  const splashes = Array.from({ length: 14 }, () => `<circle cx="${(between(random, 0.15, 0.85) * width).toFixed(1)}" cy="${(between(random, 0.6, 0.95) * height).toFixed(1)}" r="${(between(random, 0.003, 0.012) * width).toFixed(1)}" fill="#5b4632" fill-opacity="${between(random, 0.35, 0.7).toFixed(2)}"/>`).join('')
  return sharp(photo).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">${splashes}</svg>`) }]).jpeg({ quality: 90 }).toBuffer()
}

export type BuiltSet = {
  readonly cases: EvaluationCase[]
  // Every photograph the cases name, by its path in the set.
  readonly files: Map<string, Buffer>
  // Which real shot each photograph started from.
  readonly sources: Map<string, string>
}

type BuildInput = {
  readonly raw: readonly RawPhoto[]
  readonly read: (file: string) => Promise<Buffer>
  readonly seed: number
  // Synthetic pairs per view and group: one number for every group, or one per group.
  readonly perGroup: number | Readonly<Partial<Record<EvaluationGroup, number>>>
}

export async function buildSet(input: BuildInput): Promise<BuiltSet> {
  const random = seededRandom(input.seed)
  const cases: EvaluationCase[] = []
  const files = new Map<string, Buffer>()
  const sources = new Map<string, string>()
  const count = (group: EvaluationGroup) => typeof input.perGroup === 'number' ? input.perGroup : (input.perGroup[group] ?? 0)
  const views = [...new Set(input.raw.filter((photo) => photo.bike === 'A').map((photo) => photo.view))].sort()
  for (const [index, view] of views.entries()) {
    const half: Half = index % 2 === 0 ? 'tuning' : 'gate'
    const shot = (bike: 'A' | 'B', session: number) => input.raw.find((photo) => photo.bike === bike && photo.view === view && photo.session === session)
    const handover = shot('A', 1)
    const later = [2, 3, 4, 5].map((session) => shot('A', session)).filter((photo): photo is RawPhoto => photo !== undefined)
    const first = later[0]
    if (handover === undefined || first === undefined) continue
    const put = (name: string, bytes: Buffer, source: string) => { const path = `${half}/${view}/${name}.jpg`; files.set(path, bytes); sources.set(path, source); return path }
    const label = (photo: RawPhoto) => `${photo.bike}-s${String(photo.session)}-${view}`
    const before = put('handover', await input.read(handover.file), label(handover))
    const pair = (group: EvaluationGroup, number: number, after: string, extra: Partial<EvaluationCase> & { note: string }): void => {
      cases.push({ id: `${half}-${view}-${group.replaceAll('_', '-')}-${String(number)}`, half, group, origin: extra.note.startsWith('synthetic') ? 'synthetic' : 'real', view, before, after, earlier: [], labels: [], knownMarks: [], ...extra })
    }
    // Real pairs, as they were taken.
    for (const [number, photo] of later.slice(0, 2).entries()) pair(number === 0 ? 'clean_easy' : 'clean_hard', 0, put(`real-${label(photo)}`, await input.read(photo.file), label(photo)), { note: `real: ${label(handover)} then ${label(photo)}` })
    const wrong = shot('B', 1)
    if (wrong !== undefined) pair('identity', 0, put(`real-${label(wrong)}`, await input.read(wrong.file), label(wrong)), { note: `real: another bike, ${label(wrong)}` })
    pair('identity', 1, put('copy-of-handover', await input.read(handover.file), label(handover)), { note: 'real: the handover photograph sent again as the return' })
    // Synthetic pairs, each from a later real shot.
    const base = async () => { const photo = later[Math.floor(random() * later.length)] ?? first; return { photo, bytes: await input.read(photo.file) } }
    for (let number = 1; number <= count('clean_easy'); number += 1) {
      const { photo, bytes } = await base(); const changed = await relight(bytes, random, 'slight')
      pair('clean_easy', number, put(`easy-${String(number)}`, changed.image, label(photo)), { note: `synthetic: ${label(photo)}, ${changed.description}` })
    }
    for (let number = 1; number <= count('clean_hard'); number += 1) {
      const { photo, bytes } = await base(); const changed = await relight(bytes, random, 'hard')
      pair('clean_hard', number, put(`hard-${String(number)}`, changed.image, label(photo)), { note: `synthetic: ${label(photo)}, ${changed.description}` })
    }
    for (let number = 1; number <= count('wear'); number += 1) {
      const { photo, bytes } = await base()
      pair('wear', number, put(`wear-${String(number)}`, await dirty(bytes, random), label(photo)), { note: `synthetic: ${label(photo)}, mud and dust` })
    }
    for (let number = 1; number <= count('damage'); number += 1) {
      const { photo, bytes } = await base()
      const kind = DAMAGE_KINDS[(number - 1) % DAMAGE_KINDS.length] ?? 'scratch'
      const size = number % 2 === 0 ? 'large' as const : 'small' as const
      const drawn = await drawDamage(bytes, { kind, size }, random)
      const poorLight = number % 3 === 0
      const image = poorLight ? (await relight(drawn.image, random, 'hard')).image : drawn.image
      pair('damage', number, put(`damage-${String(number)}`, image, label(photo)), { labels: [{ kind: kind === 'missing' ? 'missing' : 'damage', region: drawn.region }], note: `synthetic: ${label(photo)}, ${size} ${kind}${poorLight ? ', poor light' : ''}` })
    }
    for (let number = 1; number <= count('known_mark'); number += 1) {
      const { photo, bytes } = await base()
      // The same mark at the same place on the item in both shots, found through the pair's own alignment.
      const shape = Math.floor(random() * 1e9)
      const original = await input.read(handover.file)
      const marked = await drawDamage(original, { kind: 'scratch', size: 'small' }, seededRandom(shape))
      const measured = await inspectPair(original, bytes)
      const returned = await drawDamage(bytes, { kind: 'scratch', size: 'small' }, seededRandom(shape), measured.ok ? mapPoint(measured.homography, marked.center) : marked.center)
      const markedBefore = put(`known-${String(number)}-handover`, marked.image, label(handover))
      cases.push({ id: `${half}-${view}-known-mark-${String(number)}`, half, group: 'known_mark', origin: 'synthetic', view, before: markedBefore, after: put(`known-${String(number)}`, returned.image, label(photo)), earlier: [], labels: [], knownMarks: [marked.region], note: `synthetic: a scratch on the item at handover, still there at return (${label(photo)})` })
    }
    for (let number = 2; number < 2 + count('identity'); number += 1) {
      const copy = await sharp(await input.read(handover.file)).resize({ width: 1400 }).jpeg({ quality: 70 }).toBuffer()
      pair('identity', number, put(`near-copy-${String(number)}`, copy, label(handover)), { note: 'synthetic: the handover photograph, resized and saved again, sent as the return' })
    }
  }
  return { cases, files, sources }
}

export { EVALUATION_GROUPS }
