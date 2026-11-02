import type { VerificationKey } from './verify.ts'

// Whether an ES256 signature holds under a published P-256 key, through Web Crypto, so a browser and the server check
// Hold's signed tokens the same way. A key or signature Web Crypto cannot read does not hold.
export async function signatureHolds(key: VerificationKey, signingInput: string, signature: Uint8Array): Promise<boolean> {
  try {
    const imported = await crypto.subtle.importKey('jwk', { kty: key.kty, crv: key.crv, x: key.x, y: key.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, imported, new Uint8Array(signature), new TextEncoder().encode(signingInput))
  } catch {
    return false
  }
}
