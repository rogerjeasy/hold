import type { ClaimMessage } from '@hold/db'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ClaimConversation } from './claim-conversation'

vi.mock('./actions', () => ({ writeToRenter: vi.fn() }))
vi.mock('./renter-actions', () => ({ writeToShop: vi.fn() }))

const messages: ClaimMessage[] = [
  { id: 'm1', author: 'renter', authorName: null, body: 'The scratch was there at pickup.', createdAt: new Date('2026-10-31T15:12:00Z') },
  { id: 'm2', author: 'shop', authorName: 'Jonas', body: 'We are checking the photographs.', createdAt: new Date('2026-11-01T08:40:00Z') },
]
const common = { shopName: 'Alpine Rentals', renterName: 'Lena Brandt', timeZone: 'Europe/Zurich', messages }

describe('the words between renter and shop on a claim', () => {
  it('shows the renter both sides, their own as theirs, and a box to write to the shop', () => {
    renderWithIntl(<ClaimConversation {...common} audience="renter" token="token" canWrite />)
    expect(screen.getByRole('heading', { name: 'Messages with Alpine Rentals' })).toBeInTheDocument()
    expect(screen.getByText('The scratch was there at pickup.')).toBeInTheDocument()
    expect(screen.getByText(/You ·/)).toBeInTheDocument()
    expect(screen.getByText(/Jonas, Alpine Rentals ·/)).toBeInTheDocument()
    expect(screen.getByLabelText('Write to the shop')).toHaveAttribute('maxLength', '1000')
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })

  it('shows staff the renter by name and lets them answer', () => {
    renderWithIntl(<ClaimConversation {...common} audience="shop" rentalId="00000000-0000-4000-8000-000000000001" canWrite />)
    expect(screen.getByRole('heading', { name: 'Messages with Lena Brandt' })).toBeInTheDocument()
    expect(screen.getByText(/Lena Brandt ·/)).toBeInTheDocument()
    expect(screen.getByLabelText('Write to Lena Brandt')).toBeInTheDocument()
  })

  it('says when nothing was written, and offers no box to a reader who may not write', () => {
    renderWithIntl(<ClaimConversation {...common} messages={[]} audience="shop" rentalId="00000000-0000-4000-8000-000000000001" canWrite={false} />)
    expect(screen.getByText('No messages yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
  })
})
