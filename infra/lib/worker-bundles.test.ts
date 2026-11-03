import { execSync } from 'node:child_process'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { NATIVE_PACKAGES, sampleCopyCommands, WORKER_NATIVE_MODULES, WORKERS_WITH_SAMPLES } from './worker.ts'

// A native package bundled into a worker's code fails when Lambda loads it: sharp and pdfkit call
// createRequire(import.meta.url), which is empty in the CommonJS bundle, so the function dies before handling anything.
// Unit and end-to-end tests never load a built bundle, so this test bundles every worker entry as the deploy does and
// checks that each native package it reaches is installed beside the bundle instead.
const WORKER_SOURCE = join(import.meta.dirname, '..', '..', 'apps', 'worker', 'src')
const entries = readdirSync(WORKER_SOURCE).filter((file) => file.endsWith('-lambda.ts'))

describe('every worker bundle', () => {
  it.each(entries)('%s bundles no native package', async (entry) => {
    const declared = WORKER_NATIVE_MODULES[entry] ?? []
    const result = await build({ entryPoints: [join(WORKER_SOURCE, entry)], bundle: true, platform: 'node', format: 'cjs', write: false, metafile: true, logLevel: 'silent', external: [...declared, '@aws-sdk/*'] })
    const bundled = Object.keys(result.metafile.inputs).filter((path) => NATIVE_PACKAGES.some((name) => path.includes(`/node_modules/${name}/`)))
    expect(bundled.map((path) => NATIVE_PACKAGES.find((name) => path.includes(`/node_modules/${name}/`)))).toEqual([])
  })
})

// The evidence worker builds sample rentals' records from the demonstration's own images, which are not in the display
// bucket, so its bundle carries them in samples/ (packages/evidence sample-displays.ts).
describe('the evidence worker’s bundle', () => {
  it('carries every sample photograph the seed names, in samples/', () => {
    expect(WORKERS_WITH_SAMPLES).toContain('evidence-lambda.ts')
    const output = mkdtempSync(join(tmpdir(), 'hold-bundle-'))
    for (const command of sampleCopyCommands(join(import.meta.dirname, '..', '..'), output)) execSync(command)
    expect(readdirSync(join(output, 'samples')).sort()).toEqual(expect.arrayContaining(['sample-drop-point.jpg', 'sample-handover.jpg', 'sample-return-damage.jpg']))
  })
})
