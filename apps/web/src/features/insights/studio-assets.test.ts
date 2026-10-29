// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { STUDIO_FILE } from './studio-assets'

const SOURCES = fileURLToPath(new URL('../..', import.meta.url))
// The package exports no package.json; its main entry is dist/package/main.cjs.js, two folders below its root.
const STUDIO_PACKAGE = join(dirname(createRequire(import.meta.url).resolve('ag-studio')), '..', '..')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

// AG Studio's module is several megabytes, as Bryntum's was when it ran the build runners out of memory, so the browser
// loads AG Studio's own build from Hold's origin, and the app may import only its types.
it('imports nothing from AG Studio but its types, so the bundler never processes it', () => {
  const importsStudio = /^\s*import\s+(?!type\b)(?:[^;]*?\bfrom\s+)?['"]ag-studio(?:-react)?['"/]/m
  const offending = sourceFiles(SOURCES).filter((path) => importsStudio.test(readFileSync(path, 'utf8')))
  expect(offending.map((path) => path.slice(SOURCES.length))).toEqual([])
})

it('names a file the installed AG Studio package has', () => {
  expect(existsSync(join(STUDIO_PACKAGE, STUDIO_FILE))).toBe(true)
})
