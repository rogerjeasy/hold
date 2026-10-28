// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { BRYNTUM_FILES } from './bryntum-assets'

const SOURCES = fileURLToPath(new URL('../..', import.meta.url))
const BRYNTUM_PACKAGE = dirname(createRequire(import.meta.url).resolve('@bryntum/scheduler/package.json'))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

// Turbopack ran out of memory on the build runners processing Bryntum's 4.6 MB module (28 October 2026), so the
// browser loads Bryntum's own build from Hold's origin, and the app may import only its types.
it('imports nothing from Bryntum but its types, so the bundler never processes it', () => {
  const importsBryntum = /^\s*import\s+(?!type\b)(?:[^;]*?\bfrom\s+)?['"]@bryntum\//m
  const offending = sourceFiles(SOURCES).filter((path) => importsBryntum.test(readFileSync(path, 'utf8')))
  expect(offending.map((path) => path.slice(SOURCES.length))).toEqual([])
})

it('names only files the installed Bryntum package has', () => {
  expect(BRYNTUM_FILES.filter((file) => !existsSync(join(BRYNTUM_PACKAGE, file)))).toEqual([])
})
