import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SAMPLE_PHOTOS } from '@hold/db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerEvidence } from './worker-evidence.ts'

// The evidence worker reads the demonstration's sample photographs from the files installed beside its code
// (infra/lib/worker.ts), never from the display bucket, where they are not.
const settings = { AWS_REGION: 'us-east-1', HOLD_DATABASE_CLUSTER_ARN: 'arn:aws:rds:us-east-1:1:cluster:hold', HOLD_DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:1:secret:hold', HOLD_DATABASE_NAME: 'hold_db', HOLD_EVIDENCE_BUCKET: 'hold-evidence', HOLD_DISPLAY_BUCKET: 'hold-display' }
afterEach(() => { vi.unstubAllEnvs() })

describe('the evidence worker’s photographs', () => {
  it('reads a sample photograph from the samples folder beside the code', async () => {
    const root = mkdtempSync(join(tmpdir(), 'hold-task-'))
    mkdirSync(join(root, 'samples'))
    writeFileSync(join(root, 'samples', 'sample-handover.jpg'), 'the sample handover')
    for (const [key, value] of Object.entries({ ...settings, LAMBDA_TASK_ROOT: root })) vi.stubEnv(key, value)
    expect((await workerEvidence().evidence.readDisplay(SAMPLE_PHOTOS.handover))?.toString()).toBe('the sample handover')
  })
})
