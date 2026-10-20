import { screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { RenterClaimScreen } from './renter-claim-screen'
vi.mock('./renter-actions', () => ({ acknowledgeClaim: vi.fn(), sendClaimCode: vi.fn(), acceptClaim: vi.fn(), contestClaim: vi.fn() }))
vi.mock('@/hooks/use-look-again', () => ({ useLookAgain: () => undefined }))
it('shows the evidence and stored charge, asks for an email code and provides a contest path', () => {
  renderWithIntl(<RenterClaimScreen token="token" data={{ shopName: 'Ribeira Bikes', currency: 'EUR', state: 'presented', totalCents: 3500, captureCents: 3500, releaseCents: 26500, invoiceCents: 0, replyDueAt: new Date('2026-10-22'), holdState: 'placed', lines: [{ id: 'line', description: 'Scratch', reason: 'Fresh scratch on the frame.', amountCents: 3500, actorName: 'Ana', beforeUrl: null, afterUrl: null }], canReply: true }} />)
  expect(screen.getByRole('button', { name: 'Email me a verification code' })).toBeInTheDocument()
  expect(screen.getByLabelText('Verification code')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Contest this claim' })).toBeInTheDocument()
  expect(screen.getByText('Fresh scratch on the frame.')).toBeInTheDocument()
})
it('keeps the reply controls available after a protective charge when the reply period is still open', () => {
  renderWithIntl(<RenterClaimScreen token="token" data={{ shopName: 'Ribeira Bikes', currency: 'EUR', state: 'charged', totalCents: 3500, captureCents: 3500, releaseCents: 26500, invoiceCents: 0, replyDueAt: new Date('2026-10-22'), holdState: 'captured', lines: [], canReply: true }} />)
  expect(screen.getByRole('button', { name: 'Contest this claim' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Your rental record' })).toHaveAttribute('href', '/r/token/record')
})

it('shows pending confirmation while a protected capture is being refunded', () => {
  renderWithIntl(<RenterClaimScreen token="token" data={{ shopName: 'Ribeira Bikes', currency: 'EUR', state: 'charged', totalCents: 3500, captureCents: 0, releaseCents: 30000, invoiceCents: 0, replyDueAt: new Date('2026-10-22'), holdState: 'captured', pendingSettlement: true, lines: [], canReply: false }} />)
  expect(screen.getByRole('status')).toHaveTextContent('Waiting for PayPal confirmation')
})
