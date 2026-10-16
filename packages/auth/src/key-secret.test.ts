import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readKeySecret } from './key-secret.ts'

const client = (secret: string | undefined) => ({ send: () => Promise.resolve({ SecretString: secret }) })

describe('reading a key from its secret', () => {
  it('takes 32 bytes from the secret’s text, the same way wherever it is read', async () => {
    const text = 'a'.repeat(48)
    expect(await readKeySecret('arn:aws:secretsmanager:us-east-1:1:secret:hold/web/renter-link-key', 'us-east-1', client(text))).toEqual(createHash('sha256').update(text).digest())
  })

  it('refuses a secret that is empty or too short to be a key', async () => {
    await expect(readKeySecret('arn:x', 'us-east-1', client(undefined))).rejects.toThrow(/empty or too short/)
    await expect(readKeySecret('arn:x', 'us-east-1', client('short'))).rejects.toThrow(/empty or too short/)
  })
})
