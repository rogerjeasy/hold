import { createHash } from 'node:crypto'
import type { JsonWebKey } from 'node:crypto'

// The port credentials are signed through (extensions.md section 7.7): an asymmetric P-256 key that never leaves its
// store. Deployed it is in AWS KMS; in tests and on a developer's machine it is a key in this process. Checking a
// credential needs only the public key.

export type PublicJwk = JsonWebKey & { readonly kid: string; readonly kty: 'EC'; readonly crv: 'P-256'; readonly x: string; readonly y: string; readonly alg: 'ES256'; readonly use: 'sig' }

export type CredentialSigner = {
  // Names the key in each credential's header, so a checker picks the right public key.
  readonly keyId: string
  // An ES256 signature of the bytes: r and s, 32 bytes each, as JWS writes it.
  sign(data: Uint8Array): Promise<Uint8Array>
  publicKey(): Promise<PublicJwk>
}

// RFC 7638: the key's own fingerprint is its ID, so the same key always has the same ID wherever it is published.
export function thumbprint(jwk: { readonly crv: string; readonly kty: string; readonly x: string; readonly y: string }): string {
  return createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url')
}

export function publicJwk(jwk: JsonWebKey): PublicJwk {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') throw new Error('The credential key is not a P-256 key.')
  const key = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y } as const
  return { ...key, kid: thumbprint(key), alg: 'ES256', use: 'sig' }
}
