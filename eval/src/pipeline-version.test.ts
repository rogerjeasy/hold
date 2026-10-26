import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { pipelineVersion } from './pipeline-version.ts'

it('changes when the comparison code changes, and ignores its tests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hold-pipeline-'))
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'src', 'pipeline.ts'), 'export const a = 1')
  const first = await pipelineVersion([join(root, 'src')], 'inspection-1')
  await writeFile(join(root, 'src', 'pipeline.test.ts'), 'test')
  expect(await pipelineVersion([join(root, 'src')], 'inspection-1')).toBe(first)
  await writeFile(join(root, 'src', 'pipeline.ts'), 'export const a = 2')
  expect(await pipelineVersion([join(root, 'src')], 'inspection-1')).not.toBe(first)
  expect(first).toMatch(/^inspection-1\+[a-f0-9]{12}$/)
})
