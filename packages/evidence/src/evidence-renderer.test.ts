import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { evidenceManifest, EvidenceRenderError } from './evidence-manifest.ts'
import { renderEvidencePdf } from './evidence-renderer.ts'
import { chainMoves } from '@hold/db'
import { evidenceFixtureId, evidenceFixtureTime, evidenceRenderFixture } from './evidence-render-fixture.ts'

// PDFKit uses hex-encoded WinAnsi text operators; inspect document text without a PDF parser dependency.
function textOf(pdf: Buffer): string {
  return [...pdf.toString('latin1').matchAll(/<([a-f0-9]+)>/gi)].map((match) => Buffer.from(match[1] ?? '', 'hex').toString('latin1')).join('')
}
function pageText(pdf: Buffer): string[] {
  const source = pdf.toString('latin1')
  return [...source.matchAll(/\/Type \/Page\b[\s\S]*?\/Contents (\d+) 0 R/g)].map((page) => {
    const content = new RegExp(`(?:^|\\n)${page[1] ?? ''} 0 obj\\n[\\s\\S]*?stream\\n([\\s\\S]*?)\\nendstream`).exec(source)?.[1] ?? ''
    return textOf(Buffer.from(content, 'latin1'))
  })
}
async function input() {
  const snapshot = evidenceRenderFixture()
  const image = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ddd' } }).jpeg().toBuffer()
  const photos = new Map(snapshot.items.flatMap((item) => item.sessions.flatMap((session) => session.photos.map((photo) => [photo.id, image] as const))))
  return { snapshot, photos, version: 3, createdAt: new Date(evidenceFixtureTime) }
}

describe('immutable evidence documents', () => {
  it('exports original and display fingerprints and sealed chains without storage keys', async () => {
    const fixture = await input()
    const hashes = new Map([...fixture.photos].map(([id, bytes]) => [id, createHash('sha256').update(bytes).digest('hex')]))
    const manifest = evidenceManifest(fixture.snapshot, hashes)
    expect(JSON.parse(manifest)).toMatchObject({ schemaVersion: 1, rentalId: fixture.snapshot.rental.id })
    expect(manifest).toContain(fixture.snapshot.items[0]?.sessions[0]?.manifestFingerprint)
    expect(manifest).toContain(hashes.values().next().value)
    expect(manifest).not.toContain('private/display/key')
    expect(evidenceManifest(fixture.snapshot, new Map([...hashes].reverse()))).toBe(manifest)
  })

  it('refuses corrupt sealed manifests and missing display hashes', async () => {
    const fixture = await input()
    const session = fixture.snapshot.items[0]?.sessions[0]
    if (session === undefined) throw new Error('fixture')
    session.manifest += ' '
    expect(() => evidenceManifest(fixture.snapshot, new Map())).toThrow(EvidenceRenderError)
    await expect(renderEvidencePdf(fixture)).rejects.toMatchObject({ code: 'corrupt_manifest' })
    await expect(renderEvidencePdf({ ...await input(), photos: new Map() })).rejects.toMatchObject({ code: 'missing_display_photo' })
  })

  it('renders deterministic paired images, all decisions and payment evidence with safe literal text', async () => {
    const fixture = await input()
    const pdf = await renderEvidencePdf(fixture)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(await renderEvidencePdf(fixture)).toEqual(pdf)
    const text = textOf(pdf)
    for (const value of ['Evidence record', 'Handover', 'Return', 'Renter reported impact', 'Reduced repair', 'quoted renter text', 'VERIFIED-CAPTURE', 'INVOICE-UNPAID', 'AUTH-EXPIRED', 'comparison-model', 'prompt-7', 'SHA-256', 'SANDBOX', 'SIMULATED', 'Uncertain scratch', 'Existing scuffs']) expect(text).toContain(value)
    expect(text).not.toContain('private/display/key')
    expect(pdf.toString('latin1')).toContain('/Subtype /Image')
  })

  it('adds the advocates’ transcript and says whether its chain of fingerprints verifies (X4.8)', async () => {
    const fixture = await input()
    const line = evidenceFixtureId(23)
    const chained = chainMoves([
      { sequence: 1, side: 'shop', kind: 'offer', lines: [{ lineId: line, cents: 1250, ground: 'evidence_stands', evidence: [] }], totalCents: 1250, passReason: null, actor: 'referee', createdAt: new Date(evidenceFixtureTime) },
      { sequence: 2, side: 'renter', kind: 'offer', lines: [{ lineId: line, cents: 600, ground: 'ordinary_wear', evidence: ['wear-1'] }], totalCents: 600, passReason: null, actor: 'renter_advocate', createdAt: new Date(evidenceFixtureTime) },
      { sequence: 3, side: 'shop', kind: 'accept', lines: [], totalCents: null, passReason: null, actor: 'shop_advocate', createdAt: new Date(evidenceFixtureTime) },
    ]).map((move) => ({ ...move, lines: move.lines.map((each) => ({ ...each, evidence: [...each.evidence] })), model: move.actor === 'referee' ? null : 'simulated', promptVersion: move.actor === 'referee' ? null : 'advocate-1', createdAt: move.createdAt.toISOString() }))
    fixture.snapshot.negotiation = { id: evidenceFixtureId(40), kind: 'negotiation', state: 'settled', endedReason: null, agreedCents: 600, simulated: true, moves: chained }
    const text = textOf(await renderEvidencePdf(fixture))
    for (const value of ['Transcript of the advocates', 'Move SHA-256', 'Chain of fingerprints verified', 'ordinary_wear', 'wear-1', 'advocate-1', chained[2]?.fingerprint ?? 'missing']) expect(text).toContain(value)
    const second = chained[1]
    if (second === undefined) throw new Error('fixture')
    fixture.snapshot.negotiation = { ...fixture.snapshot.negotiation, moves: [chained[0], { ...second, totalCents: 650 }, chained[2]].filter((move) => move !== undefined) }
    expect(textOf(await renderEvidencePdf(fixture))).toContain('BROKEN at move 2')
  })

  it.each([['fr', 'Dossier de location'], ['de', 'Mietnachweis'], ['es', 'Registro de alquiler']] as const)('localizes %s document labels and paginates long text', async (language, heading) => {
    const fixture = await input()
    fixture.snapshot.rental.language = language
    fixture.snapshot.agreement.wearRules = 'Long policy text with clear wrapping. '.repeat(600)
    const pdf = await renderEvidencePdf(fixture)
    expect(textOf(pdf)).toContain(heading)
    expect([...pdf.toString('latin1').matchAll(/\/Type \/Page\b/g)].length).toBeGreaterThan(5)
  })

  it('states missing stages and absent reply without implying consent', async () => {
    const fixture = await input()
    fixture.snapshot.items = []
    fixture.snapshot.claim = null
    fixture.snapshot.comparisons = []
    fixture.snapshot.replies = []
    fixture.snapshot.rental.conditionReply = null
    fixture.snapshot.payments = []
    const text = textOf(await renderEvidencePdf(fixture))
    expect(text).toContain('Not yet recorded')
    expect(text).toContain('No renter reply recorded')
    expect(text).toContain('No verified payment recorded')
  })

  it('keeps page numbers on content pages without creating empty footer pages', async () => {
    const pdf = await renderEvidencePdf(await input())
    for (const text of pageText(pdf)) expect(text.length).toBeGreaterThan(100)
  })

  it('identifies the item on the page containing its photograph pair', async () => {
    const pages = pageText(await renderEvidencePdf(await input()))
    const pairedPage = pages.find((text) => text.includes('Handover') && text.includes('Return'))
    expect(pairedPage).toContain('Touring bicycle')
  })
})

describe('how the comparison was measured', () => {
  it('names the run the comparison was last measured in, with its counts', async () => {
    const fixture = await input()
    const measured = { ...fixture.snapshot, measurement: { pipelineVersion: 'inspection-1+abc123def456', dataSetVersion: 'f'.repeat(64), completedAt: evidenceFixtureTime, damageFound: { count: 34, total: 40 }, cleanWronglyFlagged: { count: 0, total: 60 } } }
    const text = textOf(await renderEvidencePdf({ ...fixture, snapshot: measured }))
    expect(text).toContain('inspection-1+abc123def456')
    expect(text).toContain('damage found 34 of 40')
    expect(text).toContain('clean returns wrongly flagged 0 of 60')
  })

  it('says when the comparison has not been measured', async () => {
    const fixture = await input()
    expect(textOf(await renderEvidencePdf({ ...fixture, snapshot: { ...fixture.snapshot, measurement: null } }))).toContain('Not measured on the evaluation set yet')
  })
})
