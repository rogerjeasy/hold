import { readFile, writeFile } from 'node:fs/promises'
import { argv } from 'node:process'

const START = '<!-- scorecard:start -->'
const END = '<!-- scorecard:end -->'

// The README carries the accepted run's table between two markers, rendered from the run's own results file, so the
// README, the run's report and the scorecard pages show the same figures (extensions.md X0.3).
export function withScorecard(readme: string, table: string): string {
  const start = readme.indexOf(START)
  const end = readme.indexOf(END)
  if (start === -1 || end < start) throw new Error('The README has no scorecard markers.')
  return `${readme.slice(0, start + START.length)}\n${table}\n${readme.slice(end)}`
}

// pnpm --filter @hold/eval readme <results file of the accepted run>
if (import.meta.main) {
  const [results] = argv.slice(2)
  if (results === undefined) throw new Error('Name the accepted run\'s results file.')
  const { readmeTable } = await import('./report.ts')
  const run = JSON.parse(await readFile(results, 'utf8'), (key, value: unknown) => key === 'completedAt' && typeof value === 'string' ? new Date(value) : value) as Parameters<typeof readmeTable>[0]
  const path = new URL('../../README.md', import.meta.url).pathname
  await writeFile(path, withScorecard(await readFile(path, 'utf8'), readmeTable(run)))
  console.log('README scorecard updated.')
}
