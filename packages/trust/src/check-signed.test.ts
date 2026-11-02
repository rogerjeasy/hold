import { describe, expect, it } from 'vitest'
import { checkSigned } from './check-signed.ts'
import { issueCredential } from './credential.ts'
import { issueEvidenceStatement } from './evidence-statement.ts'
import { createLocalSigner } from './local-signer.ts'

const NOW = new Date('2026-11-01T09:00:00Z')
const MANIFEST = JSON.stringify({ session: '0b6a4f6e-1c1d-4b43-8f6e-4a9b5c2d1e01', item: '6f1c2b8e-2f43-4c3e-9a51-0d7f4a1c9b10', kind: 'handover', sealedAt: NOW.toISOString(), previous: null, photos: [] })

describe('checking whatever Hold signed', () => {
  it('checks a Clean Record credential as one', async () => {
    const signer = createLocalSigner()
    const token = await issueCredential(signer, 'a'.repeat(43), { clean: 1, settled: 0, unpaid: 0, open: 0, shops: 1, windowMonths: 24 }, NOW)
    expect(await checkSigned(token, [await signer.publicKey()], NOW)).toMatchObject({ kind: 'credential', result: { ok: true } })
  })

  it('checks an evidence statement as one', async () => {
    const signer = createLocalSigner()
    const token = await issueEvidenceStatement(signer, { shopName: 'Ribeira Bikes', timeZone: 'Europe/Lisbon', itemLabel: 'City e-bike 4', simulated: false, confirmed: null, views: {}, sessions: [{ kind: 'handover', manifest: MANIFEST, fingerprint: 'c'.repeat(64), takenBy: 'owner', sources: {} }] }, NOW)
    expect(await checkSigned(token, [await signer.publicKey()], NOW)).toMatchObject({ kind: 'evidence', result: { ok: true } })
  })

  it('treats anything else as a credential that does not check', async () => {
    expect(await checkSigned('nonsense', [], NOW)).toEqual({ kind: 'credential', result: { ok: false, error: 'malformed' } })
  })
})
