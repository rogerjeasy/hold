import { createHash } from 'node:crypto'
import type { DocumentStore } from './document-port.ts'

export function createMemoryDocumentStore(): DocumentStore {
  const saved = new Map<string, { bytes: Buffer; versionId: string; sha256: string; contentType: string }>()
  const read = (key: string, versionId: string) => {
    const found = saved.get(key)
    if (found === undefined || found.versionId !== versionId) throw new Error('Document version missing')
    return found
  }
  return {
    put(key, bytes, contentType) {
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const previous = saved.get(key)
      if (previous !== undefined && previous.sha256 !== sha256) return Promise.reject(new Error('Document conflict'))
      const found = previous ?? { bytes: Buffer.from(bytes), versionId: sha256, sha256, contentType }
      saved.set(key, found)
      return Promise.resolve({ versionId: found.versionId, sha256 })
    },
    read: (key, versionId) => Promise.resolve().then(() => Buffer.from(read(key, versionId).bytes)),
    downloadLink(key, versionId) {
      const found = read(key, versionId)
      return Promise.resolve(`data:${found.contentType};base64,${found.bytes.toString('base64')}`)
    },
  }
}
