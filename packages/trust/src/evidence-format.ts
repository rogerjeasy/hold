import { CAPTURE_SESSION_KINDS, CONDITION_REPLIES, PHOTO_SOURCES, STAFF_ROLES } from '@hold/domain'
import { z } from 'zod'
import { CREDENTIAL_ISSUER } from './credential-format.ts'

// What an evidence statement holds (architecture.md section 9.7): a compact ES256 JWS, signed with the Clean Record's
// key under a type of its own, saying which sealed sessions Hold holds for one item in one rental. Each session carries
// its manifest's exact text, so a checker hashes it again rather than believing the fingerprint. No renter, no
// address, no storage key. Shared by the server that signs it and any browser that checks it, so it uses nothing of
// Node's.

export const EVIDENCE_TYPE = 'hold-evidence+jwt'
export const EVIDENCE_ISSUER = CREDENTIAL_ISSUER

const fingerprint = z.string().regex(/^[0-9a-f]{64}$/)
const instant = z.iso.datetime({ offset: true })
const view = z.string().min(1).max(64)
const name = z.string().max(200)

export const evidenceHeader = z.strictObject({ alg: z.literal('ES256'), typ: z.literal(EVIDENCE_TYPE), kid: z.string().min(1).max(100) })
export const evidenceClaims = z.strictObject({
  iss: z.literal(EVIDENCE_ISSUER),
  iat: z.number().int().min(0),
  ev: z.strictObject({
    shop: name,
    // The shop's IANA time zone, so a checker shows each time on the shop's clock.
    zone: z.string().min(1).max(64),
    item: name,
    simulated: z.boolean(),
    confirmed: z.strictObject({ reply: z.enum(CONDITION_REPLIES), at: instant }).nullable(),
    views: z.record(view, name),
    sessions: z
      .array(
        z.strictObject({
          manifest: z.string().max(20_000),
          fingerprint,
          taken_by: z.enum([...STAFF_ROLES, 'renter', 'staff']),
          sources: z.record(view, z.enum(PHOTO_SOURCES).nullable()),
        }),
      )
      .min(1)
      .max(20),
  }),
})
export type EvidenceClaims = z.infer<typeof evidenceClaims>

// A sealed manifest as manifestText writes it (packages/domain).
export const sealedManifest = z.strictObject({
  session: z.uuid(),
  item: z.uuid(),
  kind: z.enum(CAPTURE_SESSION_KINDS),
  sealedAt: instant,
  previous: fingerprint.nullable(),
  photos: z.array(z.strictObject({ view, sha256: fingerprint, receivedAt: instant })),
})
