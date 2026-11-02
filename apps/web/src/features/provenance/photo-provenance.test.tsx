import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { CheckEvidence } from './check-evidence'
import { HandoverConfirmation } from './handover-confirmation'
import { PhotoProvenance } from './photo-provenance'

const checkEvidence = vi.fn()
vi.mock('@/features/records/renter-actions', () => ({ checkEvidence: (...args: unknown[]) => checkEvidence(...args) as unknown }))
const assign = vi.fn()

afterEach(() => {
  checkEvidence.mockReset()
  assign.mockReset()
  vi.unstubAllGlobals()
})

const SHA = '7ac39badb505d60e5c4c92018f9ae4410ffb80912d2c7fbbc9cd9202990e8080'
const provenance = { takenAt: new Date('2026-11-01T09:14:00Z'), takenBy: 'counter_staff' as const, source: 'camera' as const, sha256: SHA, sealedAt: new Date('2026-11-01T09:20:00Z') }

describe('the line under an evidence photograph', () => {
  it('says when Hold received it, who took it, how, its fingerprint and when it was sealed', () => {
    renderWithIntl(<PhotoProvenance provenance={provenance} timeZone="Europe/Lisbon" />)
    const term = (name: string) => screen.getByText(name, { selector: 'dt' }).nextElementSibling
    expect(term('Received')).toHaveTextContent('Nov 1, 09:14')
    expect(term('Taken by')).toHaveTextContent('Counter staff')
    expect(term('Taken with')).toHaveTextContent('Hold’s camera, in the app')
    expect(term('Fingerprint')).toHaveTextContent('7ac3 9bad b505 d60e')
    expect(term('Fingerprint')?.querySelector('[title]')).toHaveAttribute('title', SHA)
    expect(term('Sealed')).toHaveTextContent('Nov 1, 09:20')
  })

  it('says plainly when a file was chosen, or the photograph is a demonstration sample, and leaves out what was never recorded', () => {
    const { rerender } = renderWithIntl(<PhotoProvenance provenance={{ ...provenance, source: 'file' }} timeZone="UTC" />)
    expect(screen.getByText('A chosen file, uploaded in the app')).toBeInTheDocument()
    rerender(<PhotoProvenance provenance={{ ...provenance, source: 'sample' }} timeZone="UTC" />)
    expect(screen.getByText('A demonstration sample photograph')).toBeInTheDocument()
    rerender(<PhotoProvenance provenance={{ ...provenance, source: null, takenBy: 'renter', sealedAt: null }} timeZone="UTC" />)
    expect(screen.queryByText('Taken with')).toBeNull()
    expect(screen.getByText('The renter')).toBeInTheDocument()
    expect(screen.getByText('Not sealed yet')).toBeInTheDocument()
  })
})

describe('checking the evidence', () => {
  it('has Hold sign the item’s evidence, then opens the page that checks it', async () => {
    vi.stubGlobal('location', { assign })
    checkEvidence.mockResolvedValue({ ok: true, value: { url: 'https://hold.example/verify#statement' } })
    renderWithIntl(<CheckEvidence token="token" itemId="item-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Check this evidence' }))
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://hold.example/verify#statement')
    })
    const sent = checkEvidence.mock.calls[0] as [unknown, FormData]
    expect([sent[1].get('token'), sent[1].get('itemId')]).toEqual(['token', 'item-1'])
  })

  it('says so when the evidence could not be signed, and opens nothing', async () => {
    vi.stubGlobal('location', { assign })
    checkEvidence.mockResolvedValue({ ok: false, failure: 'refused', reason: 'signing_unavailable' })
    renderWithIntl(<CheckEvidence token="token" itemId="item-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Check this evidence' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be checked just now')
    expect(assign).not.toHaveBeenCalled()
  })
})

describe('the renter’s own confirmation of the handover photographs', () => {
  it('is shown with its time', () => {
    renderWithIntl(<HandoverConfirmation confirmed={{ reply: 'confirmed', at: new Date('2026-11-01T10:44:00Z') }} timeZone="UTC" />)
    expect(screen.getByText('You confirmed the handover photographs on Nov 1 at 10:44 AM.')).toBeInTheDocument()
  })

  it('says when the renter added photographs of what staff missed instead', () => {
    renderWithIntl(<HandoverConfirmation confirmed={{ reply: 'added', at: new Date('2026-11-01T10:44:00Z') }} timeZone="UTC" />)
    expect(screen.getByText('You added photographs of what staff missed on Nov 1 at 10:44 AM.')).toBeInTheDocument()
  })
})
