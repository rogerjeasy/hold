import { z } from 'zod'

// What a Clean Record credential holds (extensions.md section 7.7): a compact ES256 JWS with the renter key, the count
// of each outcome, the window, the number of different shops, when it was issued and a short expiry. Nothing else: no
// name, email, payer ID, shop or amount. Shared by the server that issues it and any browser that checks it, so it uses
// nothing of Node's.

export const CREDENTIAL_MINUTES = 10
export const CREDENTIAL_TYPE = 'hold-clean-record+jwt'
export const CREDENTIAL_ISSUER = 'hold'

const count = z.number().int().min(0).max(100_000)
const seconds = z.number().int().min(0)
export const credentialHeader = z.strictObject({ alg: z.literal('ES256'), typ: z.literal(CREDENTIAL_TYPE), kid: z.string().min(1).max(100) })
export const credentialClaims = z.strictObject({
  iss: z.literal(CREDENTIAL_ISSUER),
  sub: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  iat: seconds,
  exp: seconds,
  rec: z.strictObject({ clean: count, settled: count, unpaid: count, open: count, shops: count, window_months: z.number().int().min(1).max(120) }),
})
export type CredentialClaims = z.infer<typeof credentialClaims>

export const toSeconds = (at: Date) => Math.floor(at.getTime() / 1000)

export function toBase64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function fromBase64url(text: string): Uint8Array {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(text.length / 4) * 4, '='))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export const encodePart = (value: unknown) => toBase64url(new TextEncoder().encode(JSON.stringify(value)))

export function decodePart<Shape>(part: string, schema: z.ZodType<Shape>): Shape | undefined {
  try {
    const parsed = schema.safeParse(JSON.parse(new TextDecoder().decode(fromBase64url(part))))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}
