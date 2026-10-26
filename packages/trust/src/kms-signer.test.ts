import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import { GetPublicKeyCommand, SignCommand } from '@aws-sdk/client-kms'
import { describe, expect, it } from 'vitest'
import { issueCredential, verifyCredential } from './credential.ts'
import { createKmsSigner } from './kms-signer.ts'
import type { KmsCalls } from './kms-signer.ts'

const NOW = new Date('2026-10-26T09:00:00Z')
const record = { clean: 5, settled: 0, unpaid: 0, open: 0, shops: 1, windowMonths: 24 }
const renterKey = 'k'.repeat(43)

// A stand-in for KMS that answers as KMS does: a DER-encoded ECDSA signature, and the public key as DER SPKI.
function fakeKms(options: { keySpec?: string; keyUsage?: string } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const calls: (SignCommand | GetPublicKeyCommand)[] = []
  const kms: KmsCalls = {
    sign: (command) => {
      calls.push(command)
      return Promise.resolve({ Signature: new Uint8Array(sign('sha256', command.input.Message ?? new Uint8Array(), { key: privateKey, dsaEncoding: 'der' })) })
    },
    publicKey: (command) => {
      calls.push(command)
      return Promise.resolve({ PublicKey: new Uint8Array(publicKey.export({ format: 'der', type: 'spki' })), KeySpec: options.keySpec ?? 'ECC_NIST_P256', KeyUsage: options.keyUsage ?? 'SIGN_VERIFY' })
    },
  }
  return { kms, calls, publicKey }
}

describe('signing credentials with a key in AWS KMS', () => {
  it('signs with the named key and ES256, so the published key checks the credential', async () => {
    const { kms, calls } = fakeKms()
    const signer = await createKmsSigner({ keyId: 'alias/hold-credential-key', kms })
    const token = await issueCredential(signer, renterKey, record, NOW)
    expect(verifyCredential(token, [await signer.publicKey()], NOW)).toMatchObject({ ok: true, value: { record } })
    const signing = calls.find((call) => call instanceof SignCommand)
    expect(signing?.input).toMatchObject({ KeyId: 'alias/hold-credential-key', MessageType: 'RAW', SigningAlgorithm: 'ECDSA_SHA_256' })
  })

  it('turns every DER signature into the 64 bytes JWS needs, whatever the length of r and s', async () => {
    const signer = await createKmsSigner({ keyId: 'alias/hold-credential-key', kms: fakeKms().kms })
    const key = await signer.publicKey()
    // About one in 256 values of r or s is short, and half have a leading zero byte: hundreds of signatures meet both.
    for (let index = 0; index < 400; index += 1) {
      expect(verifyCredential(await issueCredential(signer, renterKey, { ...record, clean: index }, NOW), [key], NOW).ok).toBe(true)
    }
  })

  it('publishes the key KMS holds, named by its own fingerprint', async () => {
    const { kms, publicKey } = fakeKms()
    const signer = await createKmsSigner({ keyId: 'alias/hold-credential-key', kms })
    const expected = publicKey.export({ format: 'jwk' })
    expect(await signer.publicKey()).toMatchObject({ kty: 'EC', crv: 'P-256', x: expected.x, y: expected.y, kid: signer.keyId, alg: 'ES256', use: 'sig' })
    expect(createPublicKey({ key: await signer.publicKey(), format: 'jwk' }).asymmetricKeyType).toBe('ec')
  })

  it.each([
    ['a key of another kind', { keySpec: 'RSA_2048' }],
    ['a key not made for signing', { keyUsage: 'ENCRYPT_DECRYPT' }],
  ])('refuses %s', async (_, options) => {
    await expect(createKmsSigner({ keyId: 'alias/hold-credential-key', kms: fakeKms(options).kms })).rejects.toThrow(/P-256 signing key/)
  })
})
