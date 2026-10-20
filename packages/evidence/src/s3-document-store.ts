import { createHash } from 'node:crypto'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { z } from 'zod'
import type { DocumentStore } from './document-port.ts'
import { LINK_SECONDS } from './port.ts'

type Client = { send(command: PutObjectCommand | GetObjectCommand | HeadObjectCommand): Promise<Record<string, unknown>> }
export type DocumentStoreOptions = { readonly evidenceBucket: string; readonly region: string; readonly client?: Client; readonly credentials?: { readonly accessKeyId: string; readonly secretAccessKey: string } }
const versionSchema = z.object({ VersionId: z.string().min(1) })

export function createS3DocumentStore(options: DocumentStoreOptions): DocumentStore {
  const signer = new S3Client({ region: options.region, ...(options.credentials === undefined ? {} : { credentials: options.credentials }) })
  const client: Client = options.client ?? signer
  const bucket = options.evidenceBucket
  return {
    async put(key, bytes, contentType) {
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      try {
        const result = versionSchema.parse(await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType, IfNoneMatch: '*', ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64') })))
        return { versionId: result.VersionId, sha256 }
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'PreconditionFailed') throw error
        const existing = z.object({ VersionId: z.string().min(1), ChecksumSHA256: z.string() }).parse(await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: 'ENABLED' })))
        if (Buffer.from(existing.ChecksumSHA256, 'base64').toString('hex') !== sha256) throw new Error('Document conflict', { cause: error })
        return { versionId: existing.VersionId, sha256 }
      }
    },
    async read(key, versionId) {
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }))
      const parsed = z.object({ Body: z.object({ transformToByteArray: z.custom<() => Promise<Uint8Array>>((value) => typeof value === 'function') }) }).parse(object)
      return Buffer.from(await parsed.Body.transformToByteArray())
    },
    downloadLink(key, versionId, filename) {
      if (!/^[a-zA-Z0-9._-]+$/.test(filename)) throw new Error('Invalid document filename')
      return getSignedUrl(signer, new GetObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId, ResponseContentDisposition: `attachment; filename="${filename}"`, ResponseCacheControl: 'private, no-store' }), { expiresIn: LINK_SECONDS })
    },
  }
}
