import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createMemoryEvidenceStore } from './memory-store.ts'
import { createS3EvidenceStore } from './s3-store.ts'

const body = Buffer.from('a photograph')
const sha256 = createHash('sha256').update(body).digest('hex')

describe('the evidence store in memory', () => {
  it('takes an upload only with the fingerprint it was given, and reads back what arrived', async () => {
    const store = createMemoryEvidenceStore({ baseUrl: 'https://hold.test/api/simulated-storage' })
    const link = await store.uploadLink({ key: 'shop/session/left-side/1.jpg', sha256, bytes: body.length })
    expect(link.url).toBe('https://hold.test/api/simulated-storage/evidence/shop/session/left-side/1.jpg')
    expect(store.receive('shop/session/left-side/1.jpg', Buffer.from('another photograph'), link.headers['x-amz-checksum-sha256'] ?? '')).toBe('checksum_mismatch')
    expect(store.receive('shop/session/left-side/1.jpg', body, link.headers['x-amz-checksum-sha256'] ?? '')).toBe('stored')
    expect(await store.stored('shop/session/left-side/1.jpg')).toEqual({ sha256, bytes: body.length })
    expect(await store.read('shop/session/left-side/1.jpg')).toEqual(body)
  })

  it('never overwrites a stored photograph, as Object Lock would refuse', async () => {
    const store = createMemoryEvidenceStore({ baseUrl: 'https://hold.test' })
    const link = await store.uploadLink({ key: 'k.jpg', sha256, bytes: body.length })
    store.receive('k.jpg', body, link.headers['x-amz-checksum-sha256'] ?? '')
    expect(store.receive('k.jpg', body, link.headers['x-amz-checksum-sha256'] ?? '')).toBe('exists')
  })

  it('knows nothing of a key that never arrived', async () => {
    expect(await createMemoryEvidenceStore({ baseUrl: 'https://hold.test' }).stored('missing.jpg')).toBeUndefined()
  })
})

describe('the evidence store on S3', () => {
  const sent: { name: string; input: object }[] = []
  const client = (reply: Record<string, unknown> | Error) => ({
    send(command: { constructor: { name: string }; input: object }) {
      sent.push({ name: command.constructor.name, input: command.input })
      return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)
    },
  })
  const options = (reply: Record<string, unknown> | Error) => ({ evidenceBucket: 'hold-evidence-1', displayBucket: 'hold-display-1', region: 'us-east-1', client: client(reply), credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' } })

  it('signs a short-lived upload that S3 takes only with this SHA-256 and size', async () => {
    const link = await createS3EvidenceStore(options({})).uploadLink({ key: 'shop/s/v/1.jpg', sha256, bytes: body.length })
    const url = new URL(link.url)
    expect(url.hostname).toBe('hold-evidence-1.s3.us-east-1.amazonaws.com')
    expect(url.pathname).toBe('/shop/s/v/1.jpg')
    expect(Number(url.searchParams.get('X-Amz-Expires'))).toBeLessThanOrEqual(300)
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('x-amz-checksum-sha256')
    expect(link.headers).toEqual({ 'content-type': 'image/jpeg', 'x-amz-checksum-sha256': Buffer.from(sha256, 'hex').toString('base64') })
  })

  it('reads back the fingerprint S3 computed, not the one the phone gave', async () => {
    sent.length = 0
    const stored = await createS3EvidenceStore(options({ ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64'), ContentLength: body.length })).stored('shop/s/v/1.jpg')
    expect(stored).toEqual({ sha256, bytes: body.length })
    expect(sent[0]).toMatchObject({ name: 'HeadObjectCommand', input: { Bucket: 'hold-evidence-1', Key: 'shop/s/v/1.jpg', ChecksumMode: 'ENABLED' } })
  })

  it('knows nothing of a key S3 does not have', async () => {
    const missing = Object.assign(new Error('Not Found'), { name: 'NotFound' })
    expect(await createS3EvidenceStore(options(missing)).stored('nothing.jpg')).toBeUndefined()
  })
})
