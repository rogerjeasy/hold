import type { RentalHold } from '@hold/db'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { HoldPanel } from './hold-panel'

const askForHold = vi.fn()
const refresh = vi.fn()
vi.mock('./actions', () => ({ askForHold: (...args: unknown[]) => askForHold(...args) as unknown }))
vi.mock('@/i18n/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ refresh }) }))

const clock = { timeZone: 'Europe/Lisbon', currency: 'EUR' }
const RENTAL = '00000000-0000-4000-8000-0000000000a3'
const hold = (overrides: Partial<RentalHold> = {}): RentalHold => ({
  id: 'hold-1',
  state: 'requested',
  strategy: 'at_counter',
  reservedCents: 300_00,
  currency: 'EUR',
  orderId: null,
  paypalAuthorizationId: null,
  assuredUntil: null,
  validUntil: null,
  placementFailure: null,
  ordinaryCents: 300_00,
  trust: null,
  ...overrides,
})

describe('the hold at pickup, for staff', () => {
  it('asks for the agreed hold once the fee is paid, and shows the code the renter scans', async () => {
    askForHold.mockResolvedValue({ ok: true, value: { url: 'https://hold.test/r/abc/pay', qr: '<svg></svg>' } })
    renderWithIntl(<HoldPanel rentalId={RENTAL} state="booked" holdCents={300_00} hold={undefined} clock={clock} />)
    expect(screen.getByRole('region', { name: 'Hold at pickup' })).toHaveTextContent('€300.00')
    await userEvent.click(screen.getByRole('button', { name: 'Ask for the hold' }))
    expect(await screen.findByRole('img', { name: "Scan with the renter's phone to approve the hold" })).toBeInTheDocument()
    expect(screen.getByTestId('renter-link')).toHaveTextContent('https://hold.test/r/abc/pay')
    expect((askForHold.mock.calls[0]?.[1] as FormData).get('rentalId')).toBe(RENTAL)
  })

  it('waits for the renter’s approval, looking again, and can show the code again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderWithIntl(<HoldPanel rentalId={RENTAL} state="awaiting_hold" holdCents={300_00} hold={hold()} clock={clock} />)
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for the renter to approve €300.00')
    expect(screen.getByRole('button', { name: 'Show the code again' })).toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(3500)
    expect(refresh).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('says plainly when PayPal declined the renter’s funding', () => {
    renderWithIntl(<HoldPanel rentalId={RENTAL} state="awaiting_hold" holdCents={300_00} hold={hold({ orderId: 'ORDER-1', placementFailure: 'declined' })} clock={clock} />)
    expect(screen.getByRole('alert')).toHaveTextContent("PayPal declined the renter's funding. Nothing was reserved.")
  })

  it('shows a placed hold with both its clocks, and the rental ready for handover', () => {
    const placed = hold({ state: 'placed', paypalAuthorizationId: 'AUTH-1', assuredUntil: new Date('2026-10-19T09:00:00Z'), validUntil: new Date('2026-11-14T09:00:00Z') })
    renderWithIntl(<HoldPanel rentalId={RENTAL} state="ready" holdCents={300_00} hold={placed} clock={clock} />)
    const panel = screen.getByRole('region', { name: 'Hold at pickup' })
    expect(panel).toHaveTextContent("€300.00 reserved in the renter's PayPal account.")
    expect(panel).toHaveTextContent('Ready for handover.')
    expect(panel).toHaveTextContent('Oct 19')
    expect(panel).toHaveTextContent('Nov 14')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('says when a new hold was asked of the renter before this one ends', () => {
    const placed = hold({ state: 'placed', orderId: 'ORDER-2', paypalAuthorizationId: 'AUTH-1', assuredUntil: new Date('2026-10-19T09:00:00Z'), validUntil: new Date('2026-11-14T09:00:00Z') })
    renderWithIntl(<HoldPanel rentalId={RENTAL} state="out" holdCents={300_00} hold={placed} clock={clock} />)
    expect(screen.getByRole('region', { name: 'Hold at pickup' })).toHaveTextContent('A new hold was asked of the renter before this one ends.')
  })
})

