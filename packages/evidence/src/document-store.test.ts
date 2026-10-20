import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import * as stores from './index.ts'

const body = Buffer.from('locked record')
const sha256 = createHash('sha256').update(body).digest('hex')
it('reuses identical locked bytes and rejects a conflicting retry', async () => {
  const store = stores.createMemoryDocumentStore()
  const first = await store.put('packs/rental/1/record.pdf', body, 'application/pdf')
  expect(first.sha256).toBe(sha256)
  expect(await store.put('packs/rental/1/record.pdf', body, 'application/pdf')).toEqual(first)
  await expect(store.put('packs/rental/1/record.pdf', Buffer.from('replacement'), 'application/pdf')).rejects.toThrow('conflict')
  expect(await store.read('packs/rental/1/record.pdf', first.versionId)).toEqual(body)
  await expect(store.read('packs/rental/1/record.pdf', 'another-version')).rejects.toThrow()
})
it('writes S3 conditionally with a checksum and signs the exact version for at most five minutes', async () => {
  const sent: object[] = []
  const store = stores.createS3DocumentStore({ evidenceBucket: 'hold-evidence', region: 'us-east-1', credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'example' }, client: { send: (command) => { sent.push(command.input); return Promise.resolve({ VersionId: 'locked-version-1' }) } } })
  const stored = await store.put('packs/record.pdf', body, 'application/pdf')
  expect(sent[0]).toMatchObject({ IfNoneMatch: '*', ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64'), ContentType: 'application/pdf', Bucket: 'hold-evidence' })
  const url = new URL(await store.downloadLink('packs/record.pdf', stored.versionId, 'record.pdf'))
  expect(url.searchParams.get('versionId')).toBe('locked-version-1')
  expect(Number(url.searchParams.get('X-Amz-Expires'))).toBeLessThanOrEqual(300)
  expect(url.searchParams.get('response-cache-control')).toBe('private, no-store')
})
it('does not accept a different S3 object after a conditional-write collision', async () => {
  const store = stores.createS3DocumentStore({ evidenceBucket: 'hold-evidence', region: 'us-east-1', client: { send(command) {
    return command.constructor.name === 'PutObjectCommand' ? Promise.reject(Object.assign(new Error('exists'), { name: 'PreconditionFailed' })) : Promise.resolve({ VersionId: 'other-version', ChecksumSHA256: Buffer.from('c'.repeat(64), 'hex').toString('base64') })
  } } })
  await expect(store.put('packs/record.pdf', body, 'application/pdf')).rejects.toThrow('conflict')
})
