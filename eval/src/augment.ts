import { EVALUATION_GROUPS } from '@hold/domain'
import type { EvaluationGroup } from '@hold/domain'
import { mapPoint } from '@hold/vision/homography'
import { inspectPair } from '@hold/vision/inspect-pair'
import sharp from 'sharp'
import { DAMAGE_KINDS, drawDamage, pasteDamage } from './damage.ts'
import type { DamagePatch } from './damage.ts'
import type { EvaluationCase, Half } from './manifest.ts'

// Turns real photographs of one bike into labelled pairs (extensions.md section 5.3, the hybrid set agreed on
// 26 October 2026). Every pair starts from two different real shots of one view, so a synthetic pair is never a
// copy the reuse check would catch. Damage is drawn only on the return shot, and its region is exact. Every
// synthetic pair says so in its note, and its origin is "synthetic" in the manifest, the report and the scorecard.

// A re-shot made from another photograph, rather than taken, is named A-s2-frame-left.generated.jpg: every pair built
// on it is synthetic.
export type RawPhoto = { readonly bike: 'A' | 'B'; readonly session: number; readonly view: string; readonly file: string; readonly generated: boolean }

const RAW_NAME = /^(A|B)-s(\d)-([a-z0-9-]+)(\.generated)?\.jpe?g$/i

export function rawCatalog(files: readonly string[]): RawPhoto[] {
  return files.flatMap((file) => {
    const match = RAW_NAME.exec(file)
    if (match === null) return []
    const [, bike, session, view, generated] = match
    return [{ bike: bike === 'B' ? 'B' as const : 'A' as const, session: Number(session), view: (view ?? '').toLowerCase(), file, generated: generated !== undefined }]
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
  // The mask of a raw photograph, where it has one: white where the item is. Damage and known marks go only there.
  readonly readMask?: (file: string) => Promise<Buffer | undefined>
  readonly seed: number
  // Synthetic pairs per view and group: one number for every group, or one per group.
  readonly perGroup: number | Readonly<Partial<Record<EvaluationGroup, number>>>
  // Photographs of real damage (eval/raw/damage). When there are any, damage pairs paste them in turn instead of
  // drawing damage, which the model can take for dirt.
  readonly patches?: readonly DamagePatch[]
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
    // Pairs as they were taken, or as generated re-shots.
    for (const [number, photo] of later.slice(0, 2).entries()) {
      const origin = photo.generated ? 'synthetic' : 'real'
      pair(number === 0 ? 'clean_easy' : 'clean_hard', 0, put(`${origin}-${label(photo)}`, await input.read(photo.file), label(photo)), { note: `${origin}: ${label(handover)} then ${label(photo)}${photo.generated ? ', a re-shot generated from another photograph' : ''}` })
    }
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
      const patch = input.patches === undefined || input.patches.length === 0 ? undefined : input.patches[(number - 1) % input.patches.length]
      const mask = await input.readMask?.(photo.file)
      const drawn = patch === undefined ? await drawDamage(bytes, { kind, size }, random, undefined, mask) : await pasteDamage(bytes, patch, size, random, undefined, mask)
      const poorLight = number % 3 === 0
      const image = poorLight ? (await relight(drawn.image, random, 'hard')).image : drawn.image
      const what = patch === undefined ? `${size} ${kind}` : `${size} ${patch.kind}, a photograph of real damage (${patch.name}), pasted`
      pair('damage', number, put(`damage-${String(number)}`, image, label(photo)), { labels: [{ kind: 'damage', region: drawn.region }], note: `synthetic: ${label(photo)}, ${what}${poorLight ? ', poor light' : ''}` })
    }
    for (let number = 1; number <= count('known_mark'); number += 1) {
      const { photo, bytes } = await base()
      // The same mark at the same place on the item in both shots, found through the pair's own alignment.
      const shape = Math.floor(random() * 1e9)
      const original = await input.read(handover.file)
      const marked = await drawDamage(original, { kind: 'scratch', size: 'small' }, seededRandom(shape), undefined, await input.readMask?.(handover.file))
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
export { DAMAGE_KINDS, drawDamage } from './damage.ts'
export type { DamageKind } from './damage.ts'
