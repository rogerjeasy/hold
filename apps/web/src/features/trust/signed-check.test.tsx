import { createHash } from 'node:crypto'
import { manifestText } from '@hold/domain'
import { createLocalSigner, issueCredential, issueEvidenceStatement } from '@hold/trust'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { SignedCheck } from './signed-check'

const record = { clean: 5, settled: 1, unpaid: 0, open: 0, shops: 2, windowMonths: 24 }
const renterKey = 'k'.repeat(43)

afterEach(() => {
  window.location.hash = ''
})

describe('checking a credential in the browser', () => {
  it('checks the credential the code’s address carries after the #, with the published key, and shows the counts', async () => {
    const signer = createLocalSigner()
    window.location.hash = await issueCredential(signer, renterKey, record, new Date())
    renderWithIntl(<SignedCheck keys={[await signer.publicKey()]} timeZone="UTC" />)
    expect(await screen.findByText(/Signed by Hold\. Valid until/)).toBeInTheDocument()
    expect(screen.getByText('Returned in good condition').nextSibling).toHaveTextContent('5')
  })

  it('refuses a credential changed after Hold signed it', async () => {
    const signer = createLocalSigner()
    const [header, , signature] = (await issueCredential(signer, renterKey, record, new Date())).split('.')
    const forged = `${header ?? ''}.${btoa(JSON.stringify({ iss: 'hold', sub: renterKey, iat: 1, exp: 9_999_999_999, rec: { clean: 50, settled: 0, unpaid: 0, open: 0, shops: 9, window_months: 24 } })).replace(/=+$/, '')}.${signature ?? ''}`
    renderWithIntl(<SignedCheck keys={[await signer.publicKey()]} timeZone="UTC" />)
    await userEvent.type(screen.getByLabelText('Credential or evidence statement'), forged)
    await userEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This credential was changed after Hold signed it.')
    expect(screen.queryByText('Returned in good condition')).not.toBeInTheDocument()
  })

  it('refuses one signed by another key', async () => {
    const other = createLocalSigner()
    renderWithIntl(<SignedCheck keys={[await createLocalSigner().publicKey()]} timeZone="UTC" />)
    await userEvent.type(screen.getByLabelText('Credential or evidence statement'), await issueCredential(other, renterKey, record, new Date()))
    await userEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("This credential was not signed with Hold's key.")
  })
})

const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex')
const ITEM = '6f1c2b8e-2f43-4c3e-9a51-0d7f4a1c9b10'
const HANDED = new Date('2026-11-01T09:00:00Z')
const RETURNED = new Date('2026-11-01T18:00:00Z')

function session(id: string, kind: 'handover' | 'return', sealedAt: Date, previous: string | null) {
  const manifest = manifestText({ sessionId: id, itemId: ITEM, kind, sealedAt, previousManifestFingerprint: previous, photos: [{ view: 'left-side', sha256: sha(`${kind} original`), receivedAt: sealedAt }] })
  return { kind, manifest, fingerprint: sha(manifest), takenBy: 'counter_staff' as const, sources: { 'left-side': 'camera' as const } }
}

async function statement(overrides: { simulated?: boolean } = {}) {
  const signer = createLocalSigner()
  const handover = session('0b6a4f6e-1c1d-4b43-8f6e-4a9b5c2d1e01', 'handover', HANDED, null)
  const token = await issueEvidenceStatement(signer, { shopName: 'Ribeira Bikes', timeZone: 'Europe/Berlin', itemLabel: 'City e-bike 4', simulated: overrides.simulated ?? false, confirmed: { reply: 'confirmed', at: new Date('2026-11-01T09:30:00Z') }, views: { 'left-side': 'Left side' }, sessions: [handover, session('0b6a4f6e-1c1d-4b43-8f6e-4a9b5c2d1e02', 'return', RETURNED, handover.fingerprint)] }, HANDED)
  return { token, keys: [await signer.publicKey()] }
}

describe('checking an evidence statement in the browser', () => {
  it('checks the statement the address carries, recomputes each seal, and shows every photograph with where it came from', async () => {
    const { token, keys } = await statement()
    window.location.hash = token
    renderWithIntl(<SignedCheck keys={keys} timeZone="UTC" />)
    expect(await screen.findByText(/Every seal was recomputed here and matches\./)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'City e-bike 4 at Ribeira Bikes' })).toBeInTheDocument()
    // On the shop's own clock, as the renter saw it, whatever the clock of the page that checks it.
    expect(screen.getByText('The renter confirmed the handover photographs on Nov 1 at 10:30 AM.')).toBeInTheDocument()
    expect(screen.getByText('Times are the shop’s local time (Europe/Berlin).')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Handover' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Return' })).toBeInTheDocument()
    expect(screen.getAllByText('Recomputed here: it matches')).toHaveLength(2)
    expect(screen.getByText('The item’s first record')).toBeInTheDocument()
    expect(screen.getByText('Names the record before it, so neither can be swapped or removed')).toBeInTheDocument()
    expect(screen.getAllByText('Hold’s camera, in the app')).toHaveLength(2)
    expect(screen.queryByText(/Sample data for a demonstration/)).toBeNull()
  })

  it('finds an original photograph in the record from its fingerprint, computed here, and says when a file is not in it', async () => {
    const { token, keys } = await statement()
    window.location.hash = token
    renderWithIntl(<SignedCheck keys={keys} timeZone="UTC" />)
    const chooser = await screen.findByLabelText('Check an original photograph')
    await userEvent.upload(chooser, new File(['return original'], 'left.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByText('This file is in the record: Left side, Return, received Nov 1 at 07:00 PM.')).toBeInTheDocument()
    await userEvent.upload(chooser, new File(['a blurred copy'], 'copy.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByText(/This file is not in this record\./)).toBeInTheDocument()
  })

  it('says a demonstration’s record is sample data', async () => {
    const { token, keys } = await statement({ simulated: true })
    window.location.hash = token
    renderWithIntl(<SignedCheck keys={keys} timeZone="UTC" />)
    expect(await screen.findByText('Sample data for a demonstration. Nothing in this record happened.')).toBeInTheDocument()
  })

  it('refuses a statement changed after Hold signed it', async () => {
    const { token, keys } = await statement()
    const [header, claims, signature] = token.split('.')
    const changed = btoa(atob((claims ?? '').replaceAll('-', '+').replaceAll('_', '/')).replace('Ribeira Bikes', 'Other Bikes!')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
    window.location.hash = `${header ?? ''}.${changed}.${signature ?? ''}`
    renderWithIntl(<SignedCheck keys={keys} timeZone="UTC" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('This statement was changed after Hold signed it.')
    expect(screen.queryByRole('heading', { name: /Ribeira Bikes/ })).toBeNull()
  })
})
