// Copies Bryntum Scheduler's own browser build from the installed package to public/vendor/bryntum, where the calendar
// loads it (src/features/calendar/bryntum-assets.ts). It runs before every build and development server: bundling
// Bryntum's 4.6 MB module ran the build runners out of memory. The copies are not committed.
import { cpSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BRYNTUM_FILES, BRYNTUM_PATH } from '../src/features/calendar/bryntum-assets.ts'

const from = dirname(createRequire(import.meta.url).resolve('@bryntum/scheduler/package.json'))
const to = join(fileURLToPath(new URL('../public', import.meta.url)), BRYNTUM_PATH)

for (const file of BRYNTUM_FILES) {
  mkdirSync(dirname(join(to, file)), { recursive: true })
  cpSync(join(from, file), join(to, file))
}
