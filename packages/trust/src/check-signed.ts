import type { Result } from '@hold/domain'
import { z } from 'zod'
import { decodePart } from './credential-format.ts'
import { EVIDENCE_TYPE } from './evidence-format.ts'
import { verifyEvidenceStatement } from './evidence-verify.ts'
import type { EvidenceProblem, VerifiedEvidence } from './evidence-verify.ts'
import { verifyCredential } from './verify.ts'
import type { CredentialProblem, VerificationKey, VerifiedCredential } from './verify.ts'

// /verify takes anything Hold signs. The type its header declares only picks the checker; the checker believes nothing
// before the signature, so a token that lies about its type simply fails.

export type SignedCheck =
  | { readonly kind: 'credential'; readonly result: Result<VerifiedCredential, CredentialProblem> }
  | { readonly kind: 'evidence'; readonly result: Result<VerifiedEvidence, EvidenceProblem> }

const declaredType = z.object({ typ: z.string() })

export async function checkSigned(token: string, publicKeys: readonly VerificationKey[], now: Date): Promise<SignedCheck> {
  const header = decodePart(token.trim().split('.')[0] ?? '', declaredType)
  if (header?.typ === EVIDENCE_TYPE) return { kind: 'evidence', result: await verifyEvidenceStatement(token, publicKeys, now) }
  return { kind: 'credential', result: await verifyCredential(token, publicKeys, now) }
}
