import { fail, ok } from '@hold/domain'
import type { CleanRecord, Result } from '@hold/domain'
import { credentialClaims, credentialHeader, decodePart, fromBase64url, toSeconds } from './credential-format.ts'

// Checking a Clean Record credential with a published public key alone, through Web Crypto, so a browser can check one
// without asking Hold, and the server checks it the same way. Nothing in the token is believed before its signature.

export type VerifiedCredential = { readonly renterKey: string; readonly record: CleanRecord; readonly issuedAt: Date; readonly expiresAt: Date }
export type CredentialProblem = 'malformed' | 'unknown_key' | 'bad_signature' | 'expired' | 'not_yet_valid'
// A published P-256 public key, as JWKS lists it.
export type VerificationKey = { readonly kid: string; readonly kty: string; readonly crv: string; readonly x: string; readonly y: string }

// A clock a little ahead of Hold's may still check a credential issued just now.
const CLOCK_LEEWAY_SECONDS = 60
const LONGEST_TOKEN = 2000
const SEGMENT = /^[A-Za-z0-9_-]+$/

async function signatureHolds(key: VerificationKey, signingInput: string, signature: Uint8Array): Promise<boolean> {
  try {
    const imported = await crypto.subtle.importKey('jwk', { kty: key.kty, crv: key.crv, x: key.x, y: key.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, imported, new Uint8Array(signature), new TextEncoder().encode(signingInput))
  } catch {
    return false
  }
}

export async function verifyCredential(token: string, publicKeys: readonly VerificationKey[], now: Date): Promise<Result<VerifiedCredential, CredentialProblem>> {
  const parts = token.length > LONGEST_TOKEN ? [] : token.trim().split('.')
  const [headerPart, claimsPart, signaturePart] = parts
  if (parts.length !== 3 || headerPart === undefined || claimsPart === undefined || signaturePart === undefined || !parts.every((part) => SEGMENT.test(part))) return fail('malformed')
  const header = decodePart(headerPart, credentialHeader)
  if (header === undefined) return fail('malformed')
  const key = publicKeys.find((each) => each.kid === header.kid)
  if (key === undefined) return fail('unknown_key')
  const signature = fromBase64url(signaturePart)
  if (signature.length !== 64 || !(await signatureHolds(key, `${headerPart}.${claimsPart}`, signature))) return fail('bad_signature')
  const claims = decodePart(claimsPart, credentialClaims)
  if (claims === undefined) return fail('malformed')
  const nowSeconds = toSeconds(now)
  if (claims.iat > nowSeconds + CLOCK_LEEWAY_SECONDS) return fail('not_yet_valid')
  if (nowSeconds >= claims.exp) return fail('expired')
  const { rec } = claims
  return ok({
    renterKey: claims.sub,
    record: { clean: rec.clean, settled: rec.settled, unpaid: rec.unpaid, open: rec.open, shops: rec.shops, windowMonths: rec.window_months },
    issuedAt: new Date(claims.iat * 1000),
    expiresAt: new Date(claims.exp * 1000),
  })
}
