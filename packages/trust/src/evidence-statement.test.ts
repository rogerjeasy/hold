import { createHash } from 'node:crypto'
import type { EvidenceStatementSource } from '@hold/db'
import { manifestText } from '@hold/domain'
import { describe, expect, it } from 'vitest'
import { issueEvidenceStatement } from './evidence-statement.ts'
import { sha256Hex, verifyEvidenceStatement } from './evidence-verify.ts'
import { issueCredential } from './credential.ts'
import { createLocalSigner } from './local-signer.ts'

const NOW = new Date('2026-11-01T09:00:00Z')
const ITEM = '6f1c2b8e-2f43-4c3e-9a51-0d7f4a1c9b10'
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const minutes = (count: number) => new Date(NOW.getTime() + count * 60_000)

function session(id: string, kind: 'handover' | 'return', sealedAt: Date, previous: string | null) {
  const manifest = manifestText({ sessionId: id, itemId: ITEM, kind, sealedAt, previousManifestFingerprint: previous, photos: [{ view: 'left-side', sha256: sha(`${id}-left`), receivedAt: sealedAt }, { view: 'right-side', sha256: sha(`${id}-right`), receivedAt: sealedAt }] })
  return { kind, manifest, fingerprint: sha(manifest), takenBy: 'counter_staff' as const, sources: { 'left-side': 'camera' as const, 'right-side': 'file' as const } }
}

const handover = session('0b6a4f6e-1c1d-4b43-8f6e-4a9b5c2d1e01', 'handover', minutes(0), sha('an earlier rental'))
const returned = session('0b6a4f6e-1c1d-4b43-8f6e-4a9b5c2d1e02', 'return', minutes(600), handover.fingerprint)
const SOURCE: EvidenceStatementSource = {
  shopName: 'Ribeira Bikes',
  timeZone: 'Europe/Lisbon',
  itemLabel: 'City e-bike 4',
  simulated: false,
  confirmed: { reply: 'confirmed', at: minutes(30) },
  views: { 'left-side': 'Left side', 'right-side': 'Right side' },
  sessions: [handover, returned],
}

const parts = (token: string) => token.split('.')
const claimsOf = (token: string) => JSON.parse(Buffer.from(parts(token)[1] ?? '', 'base64url').toString('utf8')) as { ev: { sessions: { manifest: string; fingerprint: string }[] } }

// Hold's own key signing changed claims, as Hold would if its database were altered before signing.
async function resigned(change: (claims: ReturnType<typeof claimsOf>) => void) {
  const signer = createLocalSigner()
  const token = await issueEvidenceStatement(signer, SOURCE, NOW)
  const claims = claimsOf(token)
  change(claims)
  const input = `${parts(token)[0] ?? ''}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`
  const signature = Buffer.from(await signer.sign(new TextEncoder().encode(input))).toString('base64url')
  return { token: `${input}.${signature}`, keys: [await signer.publicKey()] }
}

describe('an evidence statement', () => {
  it('verifies with the published key alone, recomputes each seal, and links the return to the handover', async () => {
    const signer = createLocalSigner()
    const token = await issueEvidenceStatement(signer, SOURCE, NOW)
    const checked = await verifyEvidenceStatement(token, [await signer.publicKey()], minutes(1))
    if (!checked.ok) throw new Error(checked.error)
    expect(checked.value).toMatchObject({ issuedAt: NOW, shop: 'Ribeira Bikes', timeZone: 'Europe/Lisbon', item: 'City e-bike 4', simulated: false, confirmed: { reply: 'confirmed', at: minutes(30) }, intact: true })
    expect(checked.value.sessions.map((each) => [each.kind, each.seal, each.link])).toEqual([['handover', 'holds', 'first'], ['return', 'holds', 'linked']])
    expect(checked.value.sessions[0]).toMatchObject({ fingerprint: handover.fingerprint, previous: sha('an earlier rental'), sealedAt: minutes(0), takenBy: 'counter_staff' })
    expect(checked.value.sessions[1]?.photos).toEqual([
      { view: 'left-side', label: 'Left side', sha256: sha('0b6a4f6e-1c1d-4b43-8f6e-4a9b5c2d1e02-left'), receivedAt: minutes(600), source: 'camera' },
      { view: 'right-side', label: 'Right side', sha256: sha('0b6a4f6e-1c1d-4b43-8f6e-4a9b5c2d1e02-right'), receivedAt: minutes(600), source: 'file' },
    ])
  })

  it('does not expire, since a tribunal may read it months later', async () => {
    const signer = createLocalSigner()
    const token = await issueEvidenceStatement(signer, SOURCE, NOW)
    expect((await verifyEvidenceStatement(token, [await signer.publicKey()], minutes(60 * 24 * 365))).ok).toBe(true)
  })

  it('shows a seal that does not match its manifest as broken, even under Hold’s own signature', async () => {
    const { token, keys } = await resigned((claims) => {
      const first = claims.ev.sessions[0]
      if (first !== undefined) first.manifest = first.manifest.replace(sha('0b6a4f6e-1c1d-4b43-8f6e-4a9b5c2d1e01-left'), sha('another photograph'))
    })
    const checked = await verifyEvidenceStatement(token, keys, NOW)
    if (!checked.ok) throw new Error(checked.error)
    expect(checked.value.intact).toBe(false)
    expect(checked.value.sessions.map((each) => each.seal)).toEqual(['broken', 'holds'])
  })

  it('says when another record of the item sits between two sessions, without calling the evidence broken', async () => {
    const { token, keys } = await resigned((claims) => {
      const { manifest, fingerprint } = session('0b6a4f6e-1c1d-4b43-8f6e-4a9b5c2d1e03', 'return', minutes(600), sha('a repair in between'))
      claims.ev.sessions.splice(1, 1, { ...claims.ev.sessions[1], manifest, fingerprint })
    })
    const checked = await verifyEvidenceStatement(token, keys, NOW)
    if (!checked.ok) throw new Error(checked.error)
    expect(checked.value.sessions.map((each) => each.link)).toEqual(['first', 'gap'])
    expect(checked.value.intact).toBe(true)
  })

  it('names a view only from the statement’s own entries, never from what an object inherits', async () => {
    const odd = (id: string) => {
      const manifest = manifestText({ sessionId: id, itemId: ITEM, kind: 'handover', sealedAt: NOW, previousManifestFingerprint: null, photos: [{ view: 'constructor', sha256: sha('odd'), receivedAt: NOW }] })
      return { kind: 'handover' as const, manifest, fingerprint: sha(manifest), takenBy: 'owner' as const, sources: {} }
    }
    const signer = createLocalSigner()
    const token = await issueEvidenceStatement(signer, { ...SOURCE, views: {}, sessions: [odd('0b6a4f6e-1c1d-4b43-8f6e-4a9b5c2d1e09')] }, NOW)
    const checked = await verifyEvidenceStatement(token, [await signer.publicKey()], NOW)
    if (!checked.ok) throw new Error(checked.error)
    expect(checked.value.sessions[0]?.photos[0]).toMatchObject({ view: 'constructor', label: null, source: null })
  })

  it('fails once changed after signing', async () => {
    const signer = createLocalSigner()
    const [header, claims, signature] = parts(await issueEvidenceStatement(signer, SOURCE, NOW))
    const changed = Buffer.from(Buffer.from(claims ?? '', 'base64url').toString('utf8').replace('Ribeira Bikes', 'Other Bikes')).toString('base64url')
    expect(await verifyEvidenceStatement(`${header ?? ''}.${changed}.${signature ?? ''}`, [await signer.publicKey()], NOW)).toEqual({ ok: false, error: 'bad_signature' })
  })

  it('fails when signed by a key Hold does not publish', async () => {
    const other = createLocalSigner()
    expect(await verifyEvidenceStatement(await issueEvidenceStatement(other, SOURCE, NOW), [await createLocalSigner().publicKey()], NOW)).toEqual({ ok: false, error: 'unknown_key' })
  })

  it('is not a Clean Record credential, and a credential is not one', async () => {
    const signer = createLocalSigner()
    const credential = await issueCredential(signer, 'a'.repeat(43), { clean: 1, settled: 0, unpaid: 0, open: 0, shops: 1, windowMonths: 24 }, NOW)
    expect(await verifyEvidenceStatement(credential, [await signer.publicKey()], NOW)).toEqual({ ok: false, error: 'malformed' })
  })

  it('fails when issued in the future', async () => {
    const signer = createLocalSigner()
    expect(await verifyEvidenceStatement(await issueEvidenceStatement(signer, SOURCE, minutes(10)), [await signer.publicKey()], NOW)).toEqual({ ok: false, error: 'not_yet_valid' })
  })

  it.each([['not a token', 'nonsense'], ['too long a token', 'a'.repeat(200_000)]])('refuses %s', async (_name, token) => {
    expect(await verifyEvidenceStatement(token, [await createLocalSigner().publicKey()], NOW)).toEqual({ ok: false, error: 'malformed' })
  })
})

describe('a file’s fingerprint', () => {
  it('is its SHA-256, as the evidence bucket records it', async () => {
    expect(await sha256Hex(new TextEncoder().encode('photograph'))).toBe(sha('photograph'))
  })
})
