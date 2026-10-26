import type { CleanRecord } from '@hold/domain'
import { CREDENTIAL_ISSUER, CREDENTIAL_MINUTES, CREDENTIAL_TYPE, credentialClaims, encodePart, toBase64url, toSeconds } from './credential-format.ts'
import type { CredentialSigner } from './signer.ts'

// Issuing a Clean Record credential (extensions.md section 7.7). It is reissued whenever the renter opens it, so it is
// short-lived, and a withdrawn consent or an unpaid claim shows quickly.

export { CREDENTIAL_MINUTES, CREDENTIAL_TYPE }

export async function issueCredential(signer: CredentialSigner, renterKey: string, record: CleanRecord, now: Date): Promise<string> {
  const header = encodePart({ alg: 'ES256', typ: CREDENTIAL_TYPE, kid: signer.keyId })
  const issued = toSeconds(now)
  const claims = credentialClaims.parse({
    iss: CREDENTIAL_ISSUER,
    sub: renterKey,
    iat: issued,
    exp: issued + CREDENTIAL_MINUTES * 60,
    rec: { clean: record.clean, settled: record.settled, unpaid: record.unpaid, open: record.open, shops: record.shops, window_months: record.windowMonths },
  })
  const signingInput = `${header}.${encodePart(claims)}`
  return `${signingInput}.${toBase64url(await signer.sign(new TextEncoder().encode(signingInput)))}`
}
