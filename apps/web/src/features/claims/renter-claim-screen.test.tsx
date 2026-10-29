import { screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { RenterClaimScreen } from './renter-claim-screen'
vi.mock('./renter-actions', () => ({ acknowledgeClaim: vi.fn(), sendClaimCode: vi.fn(), acceptClaim: vi.fn(), contestClaim: vi.fn() }))
vi.mock('@/features/negotiation/renter-actions', () => ({ startAdvocate: vi.fn() }))
vi.mock('@/features/promise/renter-actions', () => ({ writeToShop: vi.fn() }))
vi.mock('@/features/promise/actions', () => ({ writeToRenter: vi.fn() }))
vi.mock('@/hooks/use-look-again', () => ({ useLookAgain: () => undefined }))
it('shows the evidence and stored charge, asks for an email code and provides a contest path', () => {
  renderWithIntl(<RenterClaimScreen token="token" data={{ shopName: 'Ribeira Bikes', currency: 'EUR', state: 'presented', totalCents: 3500, captureCents: 3500, releaseCents: 26500, invoiceCents: 0, replyDueAt: new Date('2026-10-22'), holdState: 'placed', lines: [{ id: 'line', description: 'Scratch', reason: 'Fresh scratch on the frame.', amountCents: 3500, actorName: 'Ana', beforeUrl: null, afterUrl: null }], canReply: true }} />)
  expect(screen.getByRole('button', { name: 'Email me a verification code' })).toBeInTheDocument()
  expect(screen.getByLabelText('Verification code')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Contest this claim' })).toBeInTheDocument()
  expect(screen.getByText('Fresh scratch on the frame.')).toBeInTheDocument()
})
it('offers a third choice before the claim is answered: an advocate, with the most the renter will pay', () => {
  renderWithIntl(<RenterClaimScreen token="token" data={{ shopName: 'Ribeira Bikes', currency: 'EUR', state: 'presented', totalCents: 3500, captureCents: 3500, releaseCents: 26500, invoiceCents: 0, replyDueAt: new Date('2026-10-22'), holdState: 'placed', lines: [], canReply: true, canAdvocate: true }} />)
  expect(screen.getByRole('heading', { name: 'Let an advocate argue it for me' })).toBeInTheDocument()
  expect(screen.getByLabelText('The most I will pay, in EUR')).toBeInTheDocument()
  expect(screen.getByText('My advocate may agree to pay up to this amount. It asks me before agreeing.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Hand my contest to an advocate' })).toBeInTheDocument()
})

it('lets the renter choose their own connected assistant as the advocate, named as it named itself and not verified', () => {
  renderWithIntl(<RenterClaimScreen token="token" data={{ shopName: 'Ribeira Bikes', currency: 'EUR', state: 'presented', totalCents: 3500, captureCents: 3500, releaseCents: 26500, invoiceCents: 0, replyDueAt: new Date('2026-10-22'), holdState: 'placed', lines: [], canReply: true, canAdvocate: true, assistantName: 'Trip planner' }} />)
  const choice = screen.getByRole('group', { name: 'Who argues it for me' })
  expect(choice).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: "Hold's advocate" })).toBeChecked()
  const own = screen.getByRole('radio', { name: /My own assistant, Trip planner/ })
  expect(own).not.toBeChecked()
  expect(own).toHaveAttribute('value', 'assistant')
  expect(screen.getByText(/It never sees the shop's limits and cannot agree to more than you write here/)).toBeInTheDocument()
})

it('offers no choice of assistant when none is connected', () => {
  renderWithIntl(<RenterClaimScreen token="token" data={{ shopName: 'Ribeira Bikes', currency: 'EUR', state: 'presented', totalCents: 3500, captureCents: 3500, releaseCents: 26500, invoiceCents: 0, replyDueAt: new Date('2026-10-22'), holdState: 'placed', lines: [], canReply: true, canAdvocate: true }} />)
  expect(screen.queryByRole('group', { name: 'Who argues it for me' })).not.toBeInTheDocument()
})

it('links to the advocate once the renter has one', () => {
  renderWithIntl(<RenterClaimScreen token="token" data={{ shopName: 'Ribeira Bikes', currency: 'EUR', state: 'agreed', totalCents: 3500, captureCents: 3500, releaseCents: 26500, invoiceCents: 0, replyDueAt: new Date('2026-10-22'), holdState: 'placed', lines: [], canReply: false, negotiation: true }} />)
  expect(screen.getByRole('link', { name: 'See what the advocates said' })).toHaveAttribute('href', '/r/token/negotiation')
  expect(screen.queryByRole('button', { name: 'Hand my contest to an advocate' })).not.toBeInTheDocument()
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

it('says plainly when a sandbox code went to the booking contact rather than the PayPal account', async () => {
  const actions = await import('./renter-actions')
  vi.mocked(actions.sendClaimCode).mockResolvedValue({ ok: true, value: { sandboxContact: true } })
  renderWithIntl(<RenterClaimScreen token="token" data={{ shopName: 'Ribeira Bikes', currency: 'EUR', state: 'presented', totalCents: 3500, captureCents: 3500, releaseCents: 26500, invoiceCents: 0, replyDueAt: new Date('2026-10-22'), holdState: 'placed', lines: [], canReply: true }} />)
  screen.getByRole('button', { name: 'Email me a verification code' }).click()
  expect(await screen.findByRole('status')).toHaveTextContent('This is the PayPal sandbox')
})

it('tells the renter what the shop promises before they contest, and the date and the conversation once they have', () => {
  const base = { shopName: 'Ribeira Bikes', currency: 'EUR', totalCents: 3500, captureCents: 3500, releaseCents: 26500, invoiceCents: 0, replyDueAt: new Date('2026-10-22'), holdState: 'placed' as const, lines: [], timeZone: 'UTC', now: new Date('2026-10-21T10:00:00Z') }
  const { unmount } = renderWithIntl(<RenterClaimScreen token="token" data={{ ...base, state: 'presented', canReply: true, promise: { days: 3, decideBy: null, decidedAt: null, missedAt: null, standing: 'none', missedReason: null }, messages: [], canWrite: true }} />)
  expect(screen.getByText('If you contest')).toBeInTheDocument()
  expect(screen.getByText(/Ribeira Bikes promises to decide within 3 days of your reply/)).toBeInTheDocument()
  unmount()
  renderWithIntl(<RenterClaimScreen token="token" data={{ ...base, state: 'contested', canReply: false, promise: { days: 3, decideBy: new Date('2026-10-24T18:00:00Z'), decidedAt: null, missedAt: null, standing: 'open', missedReason: null }, messages: [{ id: 'm1', author: 'shop', authorName: 'Ana', body: 'We are checking.', createdAt: new Date('2026-10-21T09:00:00Z') }], canWrite: true }} />)
  expect(screen.getByText('The shop decides by')).toBeInTheDocument()
  // The renter's own reply deadline means nothing once they have replied; the shop's date is the one that counts.
  expect(screen.queryByText(/Reply by/)).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Messages with Ribeira Bikes' })).toBeInTheDocument()
  expect(screen.getByText('We are checking.')).toBeInTheDocument()
  expect(screen.getByLabelText('Write to the shop')).toBeInTheDocument()
})
