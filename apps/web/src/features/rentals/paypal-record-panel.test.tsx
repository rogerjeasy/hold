import type { PayPalRecord, PayPalRecordLine } from '@hold/db'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { PayPalRecordPanel } from './paypal-record-panel'

const clock = { timeZone: 'UTC', currency: 'EUR' }
const line = (overrides: Partial<PayPalRecordLine>): PayPalRecordLine => ({
  kind: 'hold_placed',
  action: 'authorize',
  currency: 'EUR',
  amountCents: 250_00,
  ids: { order: '6X199146WE299822L', authorization: '0VF52814937998046' },
  paypalStatus: 'CREATED',
  finalCapture: null,
  requestId: 'hold-placement-7f3a',
  callState: 'confirmed',
  at: new Date('2026-11-03T10:14:00Z'),
  readBackAt: new Date('2026-11-03T10:14:05Z'),
  event: null,
  authorizationState: 'captured',
  ...overrides,
})
const record = (lines: readonly PayPalRecordLine[], simulated = false): PayPalRecord => ({ simulated, lines })

describe('the PayPal record on a rental’s page', () => {
  it('shows each call with PayPal’s ids, its status, the PayPal-Request-Id and the read-back', () => {
    renderWithIntl(<PayPalRecordPanel record={record([line({})])} clock={clock} />)
    const panel = screen.getByRole('region', { name: 'PayPal record' })
    const item = within(panel).getByRole('listitem')
    expect(item).toHaveTextContent('Hold placed')
    expect(item).toHaveTextContent('€250.00')
    expect(item).toHaveTextContent('Order6X199146WE299822L')
    expect(item).toHaveTextContent('Authorization0VF52814937998046')
    expect(item).toHaveTextContent('PayPal statusCREATED')
    expect(item).toHaveTextContent('Authorization nowCaptured')
    expect(item).toHaveTextContent('PayPal-Request-Idhold-placement-7f3a')
    expect(item).toHaveTextContent('Read back from PayPal, Tue, Nov 3, 10:14 AM')
  })

  it('says a damage charge was a final capture, and names the verified PayPal event that confirmed it', () => {
    const event = { type: 'PAYMENT.CAPTURE.COMPLETED', eventId: 'WH-1', receivedAt: new Date('2026-11-03T10:20:00Z'), simulated: false }
    renderWithIntl(<PayPalRecordPanel record={record([line({ kind: 'hold_captured', action: 'capture', amountCents: 35_00, paypalStatus: 'COMPLETED', finalCapture: true, ids: { capture: '5TY0' }, event })])} clock={clock} />)
    const item = screen.getByRole('listitem')
    expect(item).toHaveTextContent('Charge captured from the hold')
    expect(item).toHaveTextContent('PayPal statusCOMPLETEDfinal_capturetrue')
    expect(item).toHaveTextContent("PayPal's signed event PAYMENT.CAPTURE.COMPLETED, verified, Tue, Nov 3, 10:20 AM")
  })

  it('shows a call PayPal has not confirmed as waiting, not as done', () => {
    renderWithIntl(<PayPalRecordPanel record={record([line({ kind: null, action: 'release', callState: 'submitted', paypalStatus: null, readBackAt: null, authorizationState: null })])} clock={clock} />)
    const item = screen.getByRole('listitem')
    expect(item).toHaveTextContent('Releasing the hold')
    expect(item).toHaveTextContent('Sent, waiting for PayPal to confirm')
    expect(item).not.toHaveTextContent('Read back from PayPal')
  })

  it('marks every line of a sample rental as made up', () => {
    renderWithIntl(<PayPalRecordPanel record={record([line({}), line({ kind: 'fee_captured', action: 'fee_capture' })], true)} clock={clock} />)
    expect(screen.getByText('A sample rental: these PayPal ids are made up, and no call was made.')).toBeInTheDocument()
    for (const item of screen.getAllByRole('listitem')) {
      expect(within(item).getByText('Sample')).toBeInTheDocument()
      // Nothing was read back from PayPal for a sample, so no line says it was.
      expect(item).not.toHaveTextContent('Read back from PayPal')
    }
  })

  it('says so when no call was made yet', () => {
    renderWithIntl(<PayPalRecordPanel record={record([])} clock={clock} />)
    expect(screen.getByRole('region', { name: 'PayPal record' })).toHaveTextContent('No call to PayPal yet.')
  })
})
