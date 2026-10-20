import type { EvidenceVersion, ReceiptDeliverySummary } from '@hold/db'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import de from '../../../messages/de.json'
import en from '../../../messages/en.json'
import es from '../../../messages/es.json'
import fr from '../../../messages/fr.json'
import { EvidenceRecordScreen } from './evidence-record-screen'
import type { RecordAction, RecordActionResult } from './record-input'

vi.mock('@/hooks/use-look-again', () => ({ useLookAgain: () => undefined }))
const action: RecordAction = () => Promise.resolve({ ok: true, value: { packId: 'pack-1' } })
const version: EvidenceVersion = { id: 'pack-1', version: 1, state: 'ready', createdAt: new Date('2026-10-20T12:00:00Z'), pdfSha256: 'a'.repeat(64), manifestFingerprint: 'b'.repeat(64) }
const props = { shopName: 'Ribeira Bikes', rentalId: 'rental-1', backHref: '/shop/rentals/rental-1', versions: [], receipts: [], build: action, download: action }

describe('evidence record screen', () => {
  it('explains the empty record and offers its first build', () => {
    renderWithIntl(<EvidenceRecordScreen {...props} />)
    expect(screen.getByRole('heading', { name: 'Your rental record' })).toBeInTheDocument()
    expect(screen.getByText('No record has been prepared yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prepare current record' })).toBeInTheDocument()
    expect(screen.getByText('No receipt emails yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to rental' })).toHaveAttribute('href', '/shop/rentals/rental-1')
  })

  it('lets read-only staff download existing records without document preparation controls', () => {
    renderWithIntl(<EvidenceRecordScreen {...props} versions={[version]} canBuild={false} />)
    expect(screen.queryByRole('button', { name: 'Update current record' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled()
  })

  it('shows a building version without offering unavailable downloads', () => {
    renderWithIntl(<EvidenceRecordScreen {...props} versions={[{ ...version, state: 'building', pdfSha256: null, manifestFingerprint: '' }]} />)
    expect(screen.getByRole('status')).toHaveTextContent('Preparing your record')
    expect(screen.queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update current record' })).toBeDisabled()
  })

  it('explains a failed build and offers a retry', () => {
    renderWithIntl(<EvidenceRecordScreen {...props} versions={[{ ...version, state: 'failed', pdfSha256: null }]} />)
    expect(screen.getByRole('alert')).toHaveTextContent('The record could not be prepared. Please try again.')
    expect(screen.getByRole('button', { name: 'Try preparing again' })).toBeEnabled()
  })

  it('keeps both versions and shows complete fingerprints and creation dates', () => {
    renderWithIntl(<EvidenceRecordScreen {...props} shopName={'Long rental shop '.repeat(20)} versions={[{ ...version, id: 'pack-2', version: 2 }, version]} />)
    expect(screen.getByRole('heading', { name: 'Version 1' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Version 2' })).toBeInTheDocument()
    expect(screen.getAllByText('a'.repeat(64))).toHaveLength(2)
    expect(screen.getAllByText('b'.repeat(64))).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Download PDF' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Download manifest' })).toHaveLength(2)
    expect(document.querySelectorAll('time[datetime="2026-10-20T12:00:00.000Z"]')).toHaveLength(2)
  })

  it('offers an update when an earlier version failed but the current version is ready', () => {
    renderWithIntl(<EvidenceRecordScreen {...props} versions={[{ ...version, id: 'pack-2', version: 2 }, { ...version, state: 'failed' }]} />)
    expect(screen.getByRole('button', { name: 'Update current record' })).toBeEnabled()
  })

  it('shows receipt delivery state and the corresponding record version', () => {
    const receipts: ReceiptDeliverySummary[] = [{ id: 'receipt-1', packId: 'pack-1', kind: 'invoice_sent', status: 'failed', amountCents: 12345, releasedCents: 0, createdAt: version.createdAt, sentAt: null }]
    renderWithIntl(<EvidenceRecordScreen {...props} versions={[version]} receipts={receipts} />)
    const section = screen.getByRole('region', { name: 'Receipt emails' })
    expect(within(section).getByText('Payment requested')).toBeInTheDocument()
    expect(within(section).getByText('Delivery failed; it will be retried.')).toBeInTheDocument()
    expect(within(section).getByText('Version 1')).toBeInTheDocument()
  })

  it.each([
    { locale: 'en' as const, messages: en, title: 'Your rental record' },
    { locale: 'fr' as const, messages: fr, title: 'Votre dossier de location' },
    { locale: 'de' as const, messages: de, title: 'Ihre Mietunterlagen' },
    { locale: 'es' as const, messages: es, title: 'Tu expediente de alquiler' },
  ])('renders the record in $locale', ({ locale, messages, title }) => {
    renderWithIntl(<EvidenceRecordScreen {...props} />, { locale, messages })
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
  })

  it('submits renter identity and artifact selection then offers a private save link', async () => {
    const download: RecordAction = (_previous, data) => {
      if (data.get('token') !== 'signed-token' || data.has('rentalId') || data.get('packId') !== 'pack-1' || data.get('kind') !== 'pdf' || data.get('locale') !== 'en') return Promise.resolve({ ok: false, failure: 'invalid' })
      return Promise.resolve({ ok: true, value: { url: 'https://files.example.test/private.pdf', filename: 'rental-record.pdf' } })
    }
    renderWithIntl(<EvidenceRecordScreen {...props} token="signed-token" versions={[version]} download={download} />)
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
    const link = await screen.findByRole('link', { name: 'Save PDF' })
    expect(link).toHaveAttribute('href', 'https://files.example.test/private.pdf')
    expect(link).toHaveAttribute('download', 'rental-record.pdf')
    expect(link).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('submits the staff rental reference and shows the queued build result', async () => {
    const build: RecordAction = (_previous, data) => Promise.resolve(data.get('rentalId') === 'rental-1' && !data.has('token') && data.get('locale') === 'en' ? { ok: true, value: { packId: 'pack-1' } } : { ok: false, failure: 'invalid' })
    renderWithIntl(<EvidenceRecordScreen {...props} build={build} />)
    fireEvent.click(screen.getByRole('button', { name: 'Prepare current record' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Your record is being prepared. This page updates automatically.')
  })

  it('shows pending action feedback and a safe failure without raw internal details', async () => {
    let finish: (value: RecordActionResult) => void = () => undefined
    const build: RecordAction = () => new Promise((resolve) => { finish = resolve })
    renderWithIntl(<EvidenceRecordScreen {...props} build={build} />)
    fireEvent.click(screen.getByRole('button', { name: 'Prepare current record' }))
    expect(await screen.findByRole('button', { name: 'Preparing…' })).toBeDisabled()
    finish({ ok: false, failure: 'postgres_credentials_secret', reason: 'raw internal detail' })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This request could not be completed. Please try again.'))
    expect(screen.queryByText(/postgres_credentials_secret|raw internal detail/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prepare current record' })).toBeEnabled()
  })
})
