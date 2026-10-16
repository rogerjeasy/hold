import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { EvidenceStore } from './port.ts'
import { LINK_SECONDS } from './port.ts'

type Client = { send: (command: HeadObjectCommand | GetObjectCommand | PutObjectCommand) => Promise<Record<string, unknown>> }

export type S3EvidenceStoreOptions = {
  readonly evidenceBucket: string
  readonly displayBucket: string
  readonly region: string
  // For tests: a client that records commands, and credentials to sign with offline.
  readonly client?: Client
  readonly credentials?: { readonly accessKeyId: string; readonly secretAccessKey: string }
}

const base64ToHex = (value: string) => Buffer.from(value, 'base64').toString('hex')

// The evidence bucket has Object Lock, so a stored original can be neither overwritten nor deleted until its retention
// ends. A PUT to it must carry a checksum; signing the SHA-256 makes S3 refuse any other file.
export function createS3EvidenceStore(options: S3EvidenceStoreOptions): EvidenceStore {
  const signer = new S3Client({ region: options.region, ...(options.credentials === undefined ? {} : { credentials: options.credentials }) })
  const client: Client = options.client ?? signer
  return {
    async uploadLink({ key, sha256, bytes }) {
      const checksum = Buffer.from(sha256, 'hex').toString('base64')
      const command = new PutObjectCommand({ Bucket: options.evidenceBucket, Key: key, ContentType: 'image/jpeg', ContentLength: bytes, ChecksumSHA256: checksum })
      const url = await getSignedUrl(signer, command, { expiresIn: LINK_SECONDS, unhoistableHeaders: new Set(['x-amz-checksum-sha256']) })
      return { url, headers: { 'content-type': 'image/jpeg', 'x-amz-checksum-sha256': checksum } }
    },
    async stored(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: options.evidenceBucket, Key: key, ChecksumMode: 'ENABLED' }))
        const checksum = head['ChecksumSHA256']
        const length = head['ContentLength']
        if (typeof checksum !== 'string' || typeof length !== 'number') return undefined
        return { sha256: base64ToHex(checksum), bytes: length }
      } catch (error) {
        if (error instanceof Error && (error.name === 'NotFound' || error.name === 'NoSuchKey')) return undefined
        throw error
      }
    },
    async read(key) {
      const object = await client.send(new GetObjectCommand({ Bucket: options.evidenceBucket, Key: key }))
      const body = object['Body'] as { transformToByteArray: () => Promise<Uint8Array> } | undefined
      if (body === undefined) throw new Error(`No original at ${key}.`)
      return Buffer.from(await body.transformToByteArray())
    },
    async putDisplay(key, body) {
      await client.send(new PutObjectCommand({ Bucket: options.displayBucket, Key: key, Body: body, ContentType: 'image/jpeg' }))
    },
    displayLink(key) {
      return getSignedUrl(signer, new GetObjectCommand({ Bucket: options.displayBucket, Key: key }), { expiresIn: LINK_SECONDS })
    },
  }
}
