import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { EraseRenter } from './erase-renter'

const erase = vi.fn()
vi.mock('./actions', () => ({ eraseRenter: (...args: unknown[]) => erase(...args) as unknown }))

const clock = { timeZone: 'Europe/Lisbon', currency: 'EUR' }
const RENTAL = '6f1c2a4e-1b2c-4d5e-8f90-1234567890ab'

beforeEach(() => {
  erase.mockReset()
})

describe('erasing the renter’s personal details', () => {
  it('sits in its own labelled section that says what is kept and that it cannot be undone', () => {
    renderWithIntl(<EraseRenter rentalId={RENTAL} erasedAt={null} clock={clock} />)
    const section = screen.getByRole('region', { name: 'Erase the renter’s personal details' })
    expect(section).toHaveTextContent(/Payments, approvals, the audit trail and the photographs stay/)
    expect(section).toHaveTextContent(/cannot be undone/)
  })

  it('asks once more on the page, and sends nothing until the owner ticks that they understand', async () => {
    const user = userEvent.setup()
    renderWithIntl(<EraseRenter rentalId={RENTAL} erasedAt={null} clock={clock} />)
    await user.click(screen.getByRole('button', { name: 'Erase personal details' }))
    const confirm = screen.getByRole('button', { name: 'Erase for good' })
    expect(confirm).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'I understand this cannot be undone.' }))
    expect(confirm).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Keep them' }))
    expect(screen.queryByRole('button', { name: 'Erase for good' })).not.toBeInTheDocument()
    expect(erase).not.toHaveBeenCalled()
  })

  it('says when it is done', async () => {
    erase.mockResolvedValue({ ok: true, value: { rentalId: RENTAL, rentals: 2 } })
    const user = userEvent.setup()
    renderWithIntl(<EraseRenter rentalId={RENTAL} erasedAt={null} clock={clock} />)
    await user.click(screen.getByRole('button', { name: 'Erase personal details' }))
    await user.click(screen.getByRole('checkbox', { name: 'I understand this cannot be undone.' }))
    await user.click(screen.getByRole('button', { name: 'Erase for good' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Personal details erased.')
    expect(erase.mock.calls[0]?.[1]).toBeInstanceOf(FormData)
    expect((erase.mock.calls[0]?.[1] as FormData).get('rentalId')).toBe(RENTAL)
  })

  it('says why it was refused', async () => {
    erase.mockResolvedValue({ ok: false, failure: 'refused', reason: 'rental_open' })
    const user = userEvent.setup()
    renderWithIntl(<EraseRenter rentalId={RENTAL} erasedAt={null} clock={clock} />)
    await user.click(screen.getByRole('button', { name: 'Erase personal details' }))
    await user.click(screen.getByRole('checkbox', { name: 'I understand this cannot be undone.' }))
    await user.click(screen.getByRole('button', { name: 'Erase for good' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('still open')
  })

  it('shows when they were erased, and offers nothing more', () => {
    renderWithIntl(<EraseRenter rentalId={RENTAL} erasedAt={new Date('2026-11-20T10:00:00Z')} clock={clock} />)
    expect(screen.getByText(/were erased on/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
