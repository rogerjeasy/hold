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
  expect(screen.getByRole('button', { name: 'Send me a verification code' })).toBeInTheDocument()
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
  vi.mocked(actions.sendClaimCode).mockResolvedValue({ ok: true, value: { via: 'email', phone: null, sandboxContact: true, shown: null } })
  renderWithIntl(<RenterClaimScreen token="token" data={{ shopName: 'Ribeira Bikes', currency: 'EUR', state: 'presented', totalCents: 3500, captureCents: 3500, releaseCents: 26500, invoiceCents: 0, replyDueAt: new Date('2026-10-22'), holdState: 'placed', lines: [], canReply: true }} />)
  screen.getByRole('button', { name: 'Send me a verification code' }).click()
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

it('shows the renter who paid that the shop repaired what they paid for, with the photograph', () => {
  const base = { shopName: 'Ribeira Bikes', currency: 'EUR', totalCents: 9000, captureCents: 9000, releaseCents: 21000, invoiceCents: 0, replyDueAt: null, holdState: 'captured' as const, canReply: false, timeZone: 'UTC' }
  const line = { id: 'line', description: 'Frame scratch, top tube', reason: 'Fresh scratch.', amountCents: 9000, actorName: 'Ana', beforeUrl: null, afterUrl: null, region: null }
  renderWithIntl(<RenterClaimScreen token="token" data={{ ...base, state: 'closed', lines: [{ ...line, repair: { repairedAt: new Date('2026-11-04T15:00:00Z'), url: '/repaired.jpg' } }] }} />)
  expect(screen.getByText('Repaired Nov 4')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Repaired: Frame scratch, top tube' })).toHaveAttribute('src', '/repaired.jpg')
  expect(screen.getByText('The shop repaired what you paid for. What the repair cost stays with the shop.')).toBeInTheDocument()
})

vi.mock('@/features/records/renter-actions', () => ({ checkEvidence: vi.fn() }))

it('says under the before and after photographs where each came from, offers to check the evidence, and shows the renter’s own confirmation of the handover', () => {
  const before = { takenAt: new Date('2026-10-16T09:14:00Z'), takenBy: 'counter_staff' as const, source: 'camera' as const, sha256: '7ac39badb505d60e5c4c92018f9ae4410ffb80912d2c7fbbc9cd9202990e8080', sealedAt: new Date('2026-10-16T09:20:00Z') }
  const after = { ...before, takenBy: 'manager' as const, source: 'file' as const, sha256: '74072fc7d4f92e0398252661a83c83eb2427a99039f8ffcac9cc62a66a41cd39' }
  renderWithIntl(<RenterClaimScreen token="token" data={{ shopName: 'Ribeira Bikes', currency: 'EUR', state: 'presented', totalCents: 3500, captureCents: 3500, releaseCents: 26500, invoiceCents: 0, replyDueAt: new Date('2026-10-22'), holdState: 'placed', canReply: false, timeZone: 'UTC', confirmed: { reply: 'confirmed', at: new Date('2026-10-16T10:44:00Z') }, lines: [{ id: 'line', description: 'Scratch', reason: 'Fresh scratch.', amountCents: 3500, actorName: 'Ana', beforeUrl: '/before.jpg', afterUrl: '/after.jpg', itemId: 'item-1', beforeProvenance: before, afterProvenance: after }] }} />)
  expect(screen.getByText('You confirmed the handover photographs on Oct 16 at 10:44 AM.')).toBeInTheDocument()
  expect(screen.getByText('7ac3 9bad b505 d60e')).toBeInTheDocument()
  expect(screen.getByText('7407 2fc7 d4f9 2e03')).toBeInTheDocument()
  expect(screen.getByText('A manager')).toBeInTheDocument()
  expect(screen.getByText('A chosen file, uploaded in the app')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Check this evidence' })).toBeInTheDocument()
})

it('tells the renter a claim waits for their review, not that it was approved against them', () => {
  renderWithIntl(<RenterClaimScreen token="token" data={{ shopName: 'Ribeira Bikes', currency: 'EUR', state: 'approved', totalCents: 3500, captureCents: 3500, releaseCents: 21500, invoiceCents: 0, replyDueAt: null, holdState: 'placed', lines: [], canReply: false }} />)
  expect(screen.getByText('A claim for you to review')).toBeInTheDocument()
  expect(screen.queryByText('Approved')).not.toBeInTheDocument()
})
