import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import { publicJwk } from './signer.ts'
import type { CredentialSigner } from './signer.ts'

// A P-256 key in this process, for tests and a developer's machine. A new one each time unless one is given, so
// credentials from an earlier run stop verifying, as they would after a key rotation.
export function createLocalSigner(privateKey: KeyObject = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey): CredentialSigner {
  const jwk = publicJwk(createPublicKey(privateKey).export({ format: 'jwk' }))
  return {
    keyId: jwk.kid,
    sign: (data) => Promise.resolve(new Uint8Array(sign('sha256', data, { key: privateKey, dsaEncoding: 'ieee-p1363' }))),
    publicKey: () => Promise.resolve(jwk),
  }
}
