import type { EvidenceStatementSource } from '@hold/db'
import { encodePart, toBase64url, toSeconds } from './credential-format.ts'
import { EVIDENCE_ISSUER, EVIDENCE_TYPE, evidenceClaims } from './evidence-format.ts'
import type { CredentialSigner } from './signer.ts'

// Signing what Hold holds about one item's evidence in one rental, for the renter or a tribunal to check on /verify
// (architecture.md section 9.7). It states what was sealed, which does not change, so it carries no expiry.
export async function issueEvidenceStatement(signer: CredentialSigner, source: EvidenceStatementSource, now: Date): Promise<string> {
  const header = encodePart({ alg: 'ES256', typ: EVIDENCE_TYPE, kid: signer.keyId })
  const claims = evidenceClaims.parse({
    iss: EVIDENCE_ISSUER,
    iat: toSeconds(now),
    ev: {
      shop: source.shopName,
      zone: source.timeZone,
      item: source.itemLabel,
      simulated: source.simulated,
      confirmed: source.confirmed === null ? null : { reply: source.confirmed.reply, at: source.confirmed.at.toISOString() },
      views: source.views,
      sessions: source.sessions.map((session) => ({ manifest: session.manifest, fingerprint: session.fingerprint, taken_by: session.takenBy, sources: session.sources })),
    },
  })
  const signingInput = `${header}.${encodePart(claims)}`
  return `${signingInput}.${toBase64url(await signer.sign(new TextEncoder().encode(signingInput)))}`
}
