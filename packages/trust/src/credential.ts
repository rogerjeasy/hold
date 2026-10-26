import { createPublicKey, verify } from 'node:crypto'
import { fail, ok } from '@hold/domain'
import type { CleanRecord, Result } from '@hold/domain'
import { z } from 'zod'
import type { CredentialSigner, PublicJwk } from './signer.ts'

// The Clean Record credential (extensions.md section 7.7): a compact ES256 JWS holding the renter key, the count of
// each outcome, the window, the number of different shops, when it was issued and a short expiry. Nothing else: no
// name, email, payer ID, shop or amount. It is reissued whenever the renter opens it, so it is short-lived.

export const CREDENTIAL_MINUTES = 10
export const CREDENTIAL_TYPE = 'hold-clean-record+jwt'
const ISSUER = 'hold'
// A clock a little ahead of Hold's may still check a credential issued just now.
const CLOCK_LEEWAY_SECONDS = 60
const LONGEST_TOKEN = 2000

const count = z.number().int().min(0).max(100_000)
const seconds = z.number().int().min(0)
const headerSchema = z.strictObject({ alg: z.literal('ES256'), typ: z.literal(CREDENTIAL_TYPE), kid: z.string().min(1).max(100) })
const claimsSchema = z.strictObject({
  iss: z.literal(ISSUER),
  sub: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  iat: seconds,
  exp: seconds,
  rec: z.strictObject({ clean: count, settled: count, unpaid: count, open: count, shops: count, window_months: z.number().int().min(1).max(120) }),
})

export type VerifiedCredential = { readonly renterKey: string; readonly record: CleanRecord; readonly issuedAt: Date; readonly expiresAt: Date }
export type CredentialProblem = 'malformed' | 'unknown_key' | 'bad_signature' | 'expired' | 'not_yet_valid'

const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
const toSeconds = (at: Date) => Math.floor(at.getTime() / 1000)

export async function issueCredential(signer: CredentialSigner, renterKey: string, record: CleanRecord, now: Date): Promise<string> {
  const header = encode({ alg: 'ES256', typ: CREDENTIAL_TYPE, kid: signer.keyId })
  const issued = toSeconds(now)
  const claims = claimsSchema.parse({
    iss: ISSUER,
    sub: renterKey,
    iat: issued,
    exp: issued + CREDENTIAL_MINUTES * 60,
    rec: { clean: record.clean, settled: record.settled, unpaid: record.unpaid, open: record.open, shops: record.shops, window_months: record.windowMonths },
  })
  const signingInput = `${header}.${encode(claims)}`
  const signature = await signer.sign(Buffer.from(signingInput, 'ascii'))
  return `${signingInput}.${Buffer.from(signature).toString('base64url')}`
}

function parsePart<Shape>(part: string, schema: z.ZodType<Shape>): Shape | undefined {
  try {
    const parsed = schema.safeParse(JSON.parse(Buffer.from(part, 'base64url').toString('utf8')))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

// Checks the signature with a published public key, then the times. Nothing in the token is believed before that.
export function verifyCredential(token: string, publicKeys: readonly PublicJwk[], now: Date): Result<VerifiedCredential, CredentialProblem> {
  const parts = token.length > LONGEST_TOKEN ? [] : token.trim().split('.')
  const [headerPart, claimsPart, signaturePart] = parts
  if (parts.length !== 3 || headerPart === undefined || claimsPart === undefined || signaturePart === undefined || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return fail('malformed')
  const header = parsePart(headerPart, headerSchema)
  if (header === undefined) return fail('malformed')
  const jwk = publicKeys.find((key) => key.kid === header.kid)
  if (jwk === undefined) return fail('unknown_key')
  const signature = Buffer.from(signaturePart, 'base64url')
  const key = createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, format: 'jwk' })
  if (signature.length !== 64 || !verify('sha256', Buffer.from(`${headerPart}.${claimsPart}`, 'ascii'), { key, dsaEncoding: 'ieee-p1363' }, signature)) return fail('bad_signature')
  const claims = parsePart(claimsPart, claimsSchema)
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
