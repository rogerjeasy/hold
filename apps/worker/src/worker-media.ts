import { createDataApiDatabase } from '@hold/db/data-api'
import { createS3EvidenceStore } from '@hold/evidence'
import type { DisplayJobDependencies } from '@hold/evidence'
import { createRekognitionFaces } from '@hold/vision'
import { loadWorkerSettings } from './worker-settings.ts'

// What making display copies needs, built once per function instance: the database as hold_worker, both photograph
// buckets, and Rekognition to find faces.
export function workerMedia(): DisplayJobDependencies {
  const settings = loadWorkerSettings(process.env)
  return {
    database: createDataApiDatabase({ region: settings.region, clusterArn: settings.database.clusterArn, secretArn: settings.database.secretArn, database: settings.database.name }),
    role: 'hold_worker',
    evidence: createS3EvidenceStore({ evidenceBucket: settings.photoBuckets.evidence, displayBucket: settings.photoBuckets.display, region: settings.region }),
    faces: createRekognitionFaces({ region: settings.region }),
  }
}
