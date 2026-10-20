import { createHash } from 'node:crypto'
import type { EvidenceStore } from './port.ts'

export type MemoryEvidenceStore = EvidenceStore & {
  // Stands in for S3 taking a PUT: refused unless the body has the signed checksum, and never over an existing object.
  receive(key: string, body: Buffer, checksumBase64: string): 'stored' | 'checksum_mismatch' | 'exists'
  // What the simulated storage route serves.
  displayed(key: string): Buffer | undefined
}

const hex = (body: Buffer) => createHash('sha256').update(body).digest('hex')

// The stores in memory, for the tests and the test environment. Uploads go to the web app's own simulated route.
export function createMemoryEvidenceStore(options: { readonly baseUrl: string }): MemoryEvidenceStore {
  const originals = new Map<string, Buffer>()
  const displays = new Map<string, Buffer>()
  return {
    uploadLink({ key, sha256 }) {
      return Promise.resolve({ url: `${options.baseUrl}/evidence/${key}`, headers: { 'content-type': 'image/jpeg', 'x-amz-checksum-sha256': Buffer.from(sha256, 'hex').toString('base64') } })
    },
    receive(key, body, checksumBase64) {
      if (originals.has(key)) return 'exists'
      if (Buffer.from(checksumBase64, 'base64').toString('hex') !== hex(body)) return 'checksum_mismatch'
      originals.set(key, body)
      return 'stored'
    },
    stored(key) {
      const body = originals.get(key)
      return Promise.resolve(body === undefined ? undefined : { sha256: hex(body), bytes: body.length })
    },
    read(key) {
      const body = originals.get(key)
      return body === undefined ? Promise.reject(new Error(`No original at ${key}.`)) : Promise.resolve(body)
    },
    putDisplay(key, body) {
      displays.set(key, body)
      return Promise.resolve()
    },
    readDisplay(key) {
      return Promise.resolve(displays.get(key))
    },
    displayLink(key) {
      return Promise.resolve(`${options.baseUrl}/display/${key}`)
    },
    displayed(key) {
      return displays.get(key)
    },
  }
}
