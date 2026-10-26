import { money } from '@hold/domain'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { CleanRecordScreen } from './clean-record-screen'
import type { CleanRecordScreenProps } from './clean-record-screen'

const answerConsent = vi.fn()
const deleteRecord = vi.fn()
const sendTrustCode = vi.fn()
vi.mock('./renter-actions', () => ({
  answerConsent: (...args: unknown[]) => answerConsent(...args) as unknown,
  deleteRecord: (...args: unknown[]) => deleteRecord(...args) as unknown,
  sendTrustCode: (...args: unknown[]) => sendTrustCode(...args) as unknown,
}))

const record = { clean: 5, settled: 1, unpaid: 0, open: 0, shops: 2, windowMonths: 24 }
const view = (overrides: Partial<CleanRecordScreenProps['view']> = {}): CleanRecordScreenProps['view'] => ({
  shopName: 'Ribeira Bikes',
  timeZone: 'Europe/Lisbon',
  own: { record, neverTaken: [{ amount: money(1240_00, 'EUR'), rentals: 6 }], consent: { answered: true, consented: false } },
  credential: { token: 'eyJ.header.sig', url: 'https://hold.test/verify#eyJ.header.sig', qr: '<svg></svg>', expiresAt: new Date('2026-10-26T09:10:00Z') },
  ...overrides,
})

describe('the renter’s Clean Record', () => {
  it('shows each count, the shops and the window, with no name, shop or amount but the deposits never taken', () => {
    renderWithIntl(<CleanRecordScreen token="token" view={view()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your Clean Record')
    const counts = screen.getByRole('region', { name: 'Your rentals in the last 24 months' })
    expect(within(counts).getByText('Returned in good condition').nextSibling).toHaveTextContent('5')
    expect(within(counts).getByText('Hold shops').nextSibling).toHaveTextContent('2')
    expect(screen.getByText('Deposits never taken from you: €1,240.00 across 6 rentals.')).toBeInTheDocument()
  })

  it('offers the credential as a code to scan and as text, with when it stops working', () => {
    renderWithIntl(<CleanRecordScreen token="token" view={view()} />)
    expect(screen.getByRole('img', { name: 'Scan to check this Clean Record' })).toBeInTheDocument()
    expect(screen.getByText('eyJ.header.sig')).toBeInTheDocument()
    expect(screen.getByText(/stops working at 09:10/)).toBeInTheDocument()
  })

  it('says plainly when the record cannot be signed just now', () => {
    renderWithIntl(<CleanRecordScreen token="token" view={view({ credential: undefined })} />)
    expect(screen.getByText('Your record cannot be signed right now. Try again in a moment.')).toBeInTheDocument()
  })

  it('asks the consent question once, in a sentence, off until the renter turns it on with their emailed code', async () => {
    answerConsent.mockResolvedValue({ ok: true, value: { consented: true } })
    sendTrustCode.mockResolvedValue({ ok: true, value: { sandboxContact: false } })
    renderWithIntl(<CleanRecordScreen token="token" view={view({ own: { record, neverTaken: [], consent: { answered: false, consented: false } } })} />)
    expect(screen.getByText('Use my record of clean returns to lower future holds at Hold shops.')).toBeInTheDocument()
    const consent = screen.getByRole('region', { name: 'Other Hold shops' })
    await userEvent.click(within(consent).getByRole('button', { name: 'Email me a code' }))
    expect(await within(consent).findByText('Code sent. It works for ten minutes.')).toBeInTheDocument()
    expect((sendTrustCode.mock.calls[0]?.[1] as FormData).get('token')).toBe('token')
    await userEvent.type(within(consent).getByLabelText('Code from the email'), '24681357')
    await userEvent.click(within(consent).getByRole('button', { name: 'Yes, use it' }))
    const sent = answerConsent.mock.calls[0]?.[1] as FormData
    expect([sent.get('consent'), sent.get('code')]).toEqual(['yes', '24681357'])
  })

  it('says plainly when the code is wrong', async () => {
    answerConsent.mockResolvedValue({ ok: false, failure: 'refused', reason: 'wrong_code' })
    renderWithIntl(<CleanRecordScreen token="token" view={view()} />)
    const consent = screen.getByRole('region', { name: 'Other Hold shops' })
    await userEvent.type(within(consent).getByLabelText('Code from the email'), '11111111')
    await userEvent.click(within(consent).getByRole('button', { name: 'Use my record at other Hold shops' }))
    expect(await within(consent).findByRole('alert')).toHaveTextContent('That code is not right.')
  })

  it('lets a renter who answered change their mind', () => {
    renderWithIntl(<CleanRecordScreen token="token" view={view({ own: { record, neverTaken: [], consent: { answered: true, consented: true } } })} />)
    expect(screen.getByText('Other Hold shops may use your record to lower your hold.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop using my record at other Hold shops' })).toBeInTheDocument()
  })

  it('deletes the record only once the renter has said they understand and given their code', async () => {
    deleteRecord.mockResolvedValue({ ok: true, value: { removed: 6 } })
    renderWithIntl(<CleanRecordScreen token="token" view={view()} />)
    const section = screen.getByRole('region', { name: 'Delete my record' })
    const remove = within(section).getByRole('button', { name: 'Delete my record' })
    await userEvent.click(remove)
    expect(deleteRecord).not.toHaveBeenCalled()
    await userEvent.click(within(section).getByRole('checkbox', { name: 'I understand my record is deleted at every Hold shop' }))
    await userEvent.type(within(section).getByLabelText('Code from the email'), '24681357')
    await userEvent.click(remove)
    expect((deleteRecord.mock.calls[0]?.[1] as FormData).get('understood')).toBe('yes')
    expect(await screen.findByText('Your record is deleted.')).toBeInTheDocument()
  })

  it('waits for the fee before there is a record', () => {
    renderWithIntl(<CleanRecordScreen token="token" view={view({ own: undefined, credential: undefined })} />)
    expect(screen.getByText('Your Clean Record starts once PayPal has confirmed your payment.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See your rental' })).toHaveAttribute('href', '/r/token')
  })
})
