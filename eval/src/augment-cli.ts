import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { EVALUATION_GROUPS } from '@hold/domain'
import { buildSet, rawCatalog } from './augment.ts'
import { damagePatchSources } from './damage.ts'
import { manifestSchema, SET_TARGETS } from './manifest.ts'

// Builds eval/set from a folder of raw photographs named like A-s1-frame-left.jpg (see augment.ts).
//   pnpm --filter @hold/eval augment --raw <folder> [--seed 1]
// Real pairs come first; synthetic pairs fill each group up to its target, spread over the views of each half.
// It replaces eval/set entirely, keeping the manifest's item type, wear policy and price codes.
// A raw photograph may have a mask beside it, A-s1-frame-left.mask.png, white where the bike is: damage and known marks
// are then drawn only on the bike, never on the wall behind it.
// A damage/ folder beside the raw photographs holds photographs of real damage and their credits (sources.json): damage
// pairs then paste those instead of drawing damage.

const { values } = parseArgs({ options: { raw: { type: 'string' }, seed: { type: 'string', default: '1' } } })
if (values.raw === undefined) throw new Error('Name the folder of raw photographs with --raw.')
const rawFolder = values.raw
const set = new URL('../set/', import.meta.url).pathname
const previous = manifestSchema.parse(JSON.parse(await readFile(join(set, 'manifest.json'), 'utf8')))
const raw = rawCatalog(await readdir(rawFolder))
const viewsPerHalf = Math.max(1, Math.floor(new Set(raw.filter((photo) => photo.bike === 'A').map((photo) => photo.view)).size / 2))
// Each view gives one or two real pairs in some groups; the rest are synthetic.
const perGroup = Object.fromEntries(EVALUATION_GROUPS.map((group) => [group, Math.max(0, Math.ceil(SET_TARGETS[group] / viewsPerHalf) - (group === 'identity' ? 2 : group.startsWith('clean') ? 1 : 0))]))
const maskOf = (file: string) => join(rawFolder, file.replace(/\.jpe?g$/i, '.mask.png'))
const readMask = async (file: string) => existsSync(maskOf(file)) ? readFile(maskOf(file)) : undefined
const damageFolder = join(rawFolder, 'damage')
const sources = existsSync(join(damageFolder, 'sources.json')) ? damagePatchSources(JSON.parse(await readFile(join(damageFolder, 'sources.json'), 'utf8'))) : []
const patches = await Promise.all(sources.map(async (each) => ({ name: each.file.replace(/\.png$/, ''), kind: each.kind, image: await readFile(join(damageFolder, each.file)) })))
if (patches.length > 0) console.log(`Pasting ${String(patches.length)} photographs of real damage: ${patches.map((each) => each.name).join(', ')}.`)
const built = await buildSet({ raw, read: (file) => readFile(join(rawFolder, file)), readMask, seed: Number(values.seed), perGroup, patches })
await rm(join(set, 'tuning'), { recursive: true, force: true })
await rm(join(set, 'gate'), { recursive: true, force: true })
for (const [path, bytes] of built.files) {
  await mkdir(dirname(join(set, path)), { recursive: true })
  await writeFile(join(set, path), bytes)
}
const manifest = manifestSchema.parse({ ...previous, cases: built.cases })
await writeFile(join(set, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
for (const half of ['tuning', 'gate'] as const) {
  const cases = manifest.cases.filter((each) => each.half === half)
  console.log(`${half}: ${EVALUATION_GROUPS.map((group) => `${group} ${String(cases.filter((each) => each.group === group).length)}/${String(SET_TARGETS[group])}`).join(', ')} (${String(cases.filter((each) => each.origin === 'real').length)} real)`)
}
