import { fail, ok } from '@hold/domain'
import type { CaptureSessionKind, ConditionReply, PhotoSource, PhotoTaker, Result } from '@hold/domain'
import { decodePart, fromBase64url } from './credential-format.ts'
import { evidenceClaims, evidenceHeader, sealedManifest } from './evidence-format.ts'
import { signatureHolds } from './jws-signature.ts'
import type { VerificationKey } from './verify.ts'

// Checking an evidence statement in the browser with Hold's published key alone (architecture.md section 9.7).
// Nothing is believed before the signature; then each seal is recomputed from its manifest's own text rather than
// taken from the statement, and each session is checked to name the one sealed before it.

export type EvidenceProblem = 'malformed' | 'unknown_key' | 'bad_signature' | 'not_yet_valid'

export type CheckedPhoto = { readonly view: string; readonly label: string | null; readonly sha256: string; readonly receivedAt: Date; readonly source: PhotoSource | null }

export type CheckedSession = {
  readonly kind: CaptureSessionKind
  readonly sealedAt: Date
  readonly fingerprint: string
  // The item's manifest before this one, or null for the item's first.
  readonly previous: string | null
  // holds: the manifest's SHA-256, computed here, is the fingerprint stated.
  readonly seal: 'holds' | 'broken'
  // first: the first session in this statement. gap: another record of the item, not in this statement, came between.
  readonly link: 'first' | 'linked' | 'gap'
  readonly takenBy: PhotoTaker
  readonly photos: readonly CheckedPhoto[]
}

export type VerifiedEvidence = {
  readonly issuedAt: Date
  readonly shop: string
  // The shop's time zone: every time here is shown on its clock.
  readonly timeZone: string
  readonly item: string
  readonly simulated: boolean
  readonly confirmed: { readonly reply: ConditionReply; readonly at: Date } | null
  // Every seal holds.
  readonly intact: boolean
  readonly sessions: readonly CheckedSession[]
}

const CLOCK_LEEWAY_SECONDS = 60
// Twenty sessions of a dozen photographs each fit with room to spare.
const LONGEST_STATEMENT = 100_000
const SEGMENT = /^[A-Za-z0-9_-]+$/

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

// A view's entry, never one an object inherits, such as `constructor`.
const own = <Value>(record: Readonly<Record<string, Value>>, key: string): Value | undefined => (Object.hasOwn(record, key) ? record[key] : undefined)

function parsedManifest(text: string) {
  try {
    const parsed = sealedManifest.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

export async function verifyEvidenceStatement(token: string, publicKeys: readonly VerificationKey[], now: Date): Promise<Result<VerifiedEvidence, EvidenceProblem>> {
  const parts = token.length > LONGEST_STATEMENT ? [] : token.trim().split('.')
  const [headerPart, claimsPart, signaturePart] = parts
  if (parts.length !== 3 || headerPart === undefined || claimsPart === undefined || signaturePart === undefined || !parts.every((part) => SEGMENT.test(part))) return fail('malformed')
  const header = decodePart(headerPart, evidenceHeader)
  if (header === undefined) return fail('malformed')
  const key = publicKeys.find((each) => each.kid === header.kid)
  if (key === undefined) return fail('unknown_key')
  const signature = fromBase64url(signaturePart)
  if (signature.length !== 64 || !(await signatureHolds(key, `${headerPart}.${claimsPart}`, signature))) return fail('bad_signature')
  const claims = decodePart(claimsPart, evidenceClaims)
  if (claims === undefined) return fail('malformed')
  if (claims.iat > Math.floor(now.getTime() / 1000) + CLOCK_LEEWAY_SECONDS) return fail('not_yet_valid')

  const { ev } = claims
  const sessions: CheckedSession[] = []
  for (const [index, session] of ev.sessions.entries()) {
    const manifest = parsedManifest(session.manifest)
    if (manifest === undefined) return fail('malformed')
    const before = ev.sessions[index - 1]
    sessions.push({
      kind: manifest.kind,
      sealedAt: new Date(manifest.sealedAt),
      fingerprint: session.fingerprint,
      previous: manifest.previous,
      seal: (await sha256Hex(new TextEncoder().encode(session.manifest))) === session.fingerprint ? 'holds' : 'broken',
      link: before === undefined ? 'first' : manifest.previous === before.fingerprint ? 'linked' : 'gap',
      takenBy: session.taken_by,
      photos: manifest.photos.map((photo) => ({ view: photo.view, label: own(ev.views, photo.view) ?? null, sha256: photo.sha256, receivedAt: new Date(photo.receivedAt), source: own(session.sources, photo.view) ?? null })),
    })
  }
  return ok({
    issuedAt: new Date(claims.iat * 1000),
    shop: ev.shop,
    timeZone: ev.zone,
    item: ev.item,
    simulated: ev.simulated,
    confirmed: ev.confirmed === null ? null : { reply: ev.confirmed.reply, at: new Date(ev.confirmed.at) },
    intact: sessions.every((session) => session.seal === 'holds'),
    sessions,
  })
}
