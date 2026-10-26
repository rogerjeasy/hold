import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Names the comparison a run measured: the prompt version, and a fingerprint of the code that decides findings.
// Tests are left out, so a new test does not look like a new pipeline.
export async function pipelineVersion(sourceFolders: readonly string[], promptVersion: string): Promise<string> {
  const hash = createHash('sha256')
  for (const folder of sourceFolders) {
    const files = (await readdir(folder, { recursive: true })).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts')).sort()
    for (const file of files) hash.update(file).update(await readFile(join(folder, file)))
  }
  return `${promptVersion}+${hash.digest('hex').slice(0, 12)}`
}
