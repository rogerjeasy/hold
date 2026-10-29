import { DROP_POINT_VIEW } from '@hold/domain'
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import type { SelfReturnData } from '@/server/self-return-page'
import { RenterReturnScreen } from './renter-return-screen'

vi.mock('./renter-actions', () => ({ startSelfReturn: vi.fn(), sendSelfReturn: vi.fn(), requestSelfReturnUpload: vi.fn(), confirmSelfReturnUpload: vi.fn() }))

// Lisbon is UTC+0 in November: the renter sends at 21:40 on Wednesday 4 November; the shop opens at 09:00.
const sent = new Date('2026-11-04T21:40:00Z')
const item = {
  sessionId: 'session-1',
  label: 'City e-bike 2',
  views: [{ key: 'left-side', label: 'Left side', outline: 'whole_side' as const }, { key: DROP_POINT_VIEW, label: DROP_POINT_VIEW, outline: 'whole_side' as const }],
  missing: ['left-side', DROP_POINT_VIEW],
  photos: [],
  guides: { 'left-side': '/images/sample-handover.jpg' },
}
const data: SelfReturnData = {
  shopName: 'Riverside Bikes',
  simulated: false,
  canAct: true,
  stage: 'intro',
  rentalState: 'out',
  dropPoint: 'The locked rack left of the door. Lock it with the code on the tag.',
  opening: { open: false, opensAt: new Date('2026-11-05T09:00:00Z') },
  timeZone: 'Europe/Lisbon',
  currency: 'EUR',
  droppedOffAt: null,
  onTime: false,
  missingAt: null,
  hold: { reservedCents: 300_00, state: 'placed' },
  paypal: null,
  items: [],
}
const show = (overrides: Partial<SelfReturnData>) => renderWithIntl(<RenterReturnScreen token="t" data={{ ...data, ...overrides }} />)

describe('the renter’s return with nobody at the counter', () => {
  it('says where to leave it in the shop’s own words, and promises nothing is charged before a person looks', () => {
    show({})
    expect(screen.getByRole('heading', { level: 1, name: 'Before you start' })).toBeInTheDocument()
    expect(screen.getByText(data.dropPoint ?? '')).toBeInTheDocument()
    expect(screen.getByText('Nothing is charged now.')).toBeInTheDocument()
    expect(document.body).toHaveTextContent('Nothing is charged now. A person at Riverside Bikes checks it when the shop opens, Thu 09:00 AM.')
    expect(document.body).toHaveTextContent('Your €300.00 hold stays reserved with PayPal until they do.')
    expect(screen.getByRole('button', { name: 'Start the photographs' })).toBeInTheDocument()
  })

  it('offers no way to start through a link that may only look', () => {
    show({ canAct: false })
    expect(screen.queryByRole('button', { name: 'Start the photographs' })).not.toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('cannot return it')
  })

  it('asks for every view and where the item was left, and sends only when all are taken', () => {
    show({ stage: 'capture', items: [item] })
    const views = screen.getByRole('list', { name: /views/i })
    expect(within(views).getByRole('button', { name: /Left side/ })).toBeInTheDocument()
    expect(within(views).getByRole('button', { name: /Where you left it/ })).toBeInTheDocument()
    expect(screen.getByText('2 photographs still to take')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send my return' })).toBeDisabled()
  })

  it('gives a receipt with the time it came back, what PayPal holds now, and what happens next', () => {
    show({ stage: 'sent', rentalState: 'dropped_off', droppedOffAt: sent, onTime: true, paypal: { status: 'created', amountCents: 300_00, checkedAt: new Date('2026-11-04T21:41:00Z') }, items: [{ ...item, missing: [], photos: [{ view: DROP_POINT_VIEW, url: '/b.jpg', simulated: false }, { view: 'left-side', url: '/a.jpg', simulated: false }] }] })
    expect(screen.getByText('Returned on time')).toBeInTheDocument()
    expect(screen.getByTestId('received-at')).toHaveTextContent('09:40 PM')
    expect(screen.getByText('Reserved, not taken')).toBeInTheDocument()
    expect(screen.getByText('Checked with PayPal at 09:41 PM')).toBeInTheDocument()
    expect(screen.getByText('2 photographs, sealed at 09:40 PM')).toBeInTheDocument()
    expect(screen.getByText('A person checks it')).toBeInTheDocument()
    // In the order they were asked for, where it was left last.
    expect(screen.getAllByRole('img').map((image) => image.getAttribute('alt'))).toEqual(['Left side', 'Where you left it'])
  })

  it('says plainly when the shop could not find it, and that nothing is charged meanwhile', () => {
    show({ stage: 'sent', rentalState: 'dropped_off', droppedOffAt: sent, missingAt: new Date('2026-11-05T09:12:00Z') })
    expect(screen.getByRole('alert')).toHaveTextContent('Riverside Bikes could not find it at the drop point')
    expect(screen.getByText('Not found at the drop point')).toBeInTheDocument()
  })

  it('shows the hold released once a person has checked it', () => {
    show({ stage: 'sent', rentalState: 'closed', droppedOffAt: sent, onTime: true, hold: { reservedCents: 300_00, state: 'released' }, paypal: { status: 'voided', amountCents: 300_00, checkedAt: sent } })
    expect(screen.getByText('Released, nothing taken')).toBeInTheDocument()
    expect(screen.getByText('Riverside Bikes checked it')).toBeInTheDocument()
    expect(screen.getByText('Hold released')).toBeInTheDocument()
  })

  it('says when PayPal could not be asked, rather than claiming it was', () => {
    show({ stage: 'sent', rentalState: 'dropped_off', droppedOffAt: sent })
    expect(screen.getByText('From Hold’s record. PayPal could not be asked just now.')).toBeInTheDocument()
  })
})
