// Copies AG Studio's own browser build from the installed package to public/vendor/ag-studio, where the insights
// dashboard loads it (src/features/insights/studio-loader.ts). It runs before every build and development server, as
// Bryntum's does: a module this size ran the build runners out of memory. The copy is not committed.
import { cpSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STUDIO_FILE, STUDIO_SCRIPT } from '../src/features/insights/studio-assets.ts'

// The package exports no package.json; its main entry is dist/package/main.cjs.js, two folders below its root.
const root = join(dirname(createRequire(import.meta.url).resolve('ag-studio')), '..', '..')
const from = join(root, STUDIO_FILE)
const to = join(fileURLToPath(new URL('../public', import.meta.url)), STUDIO_SCRIPT)

mkdirSync(dirname(to), { recursive: true })
cpSync(from, to)
