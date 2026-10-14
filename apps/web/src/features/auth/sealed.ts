import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Encrypts a small value for a cookie, so the browser can carry it but cannot read or change it.
// AES-256-GCM: a changed or forged cookie fails to open.
const IV_BYTES = 12
const TAG_BYTES = 16

export function seal(value: unknown, key: Buffer): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
}

// Nothing for anything that was not sealed with this key.
export function unseal(sealed: string, key: Buffer): unknown {
  try {
    const bytes = Buffer.from(sealed, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, IV_BYTES))
    decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
    const text = Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8')
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}
