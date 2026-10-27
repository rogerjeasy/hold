import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ClaimScreen } from './claim-screen'
import type { ClaimWorkspace } from '@hold/db'
vi.mock('./actions', () => ({ prepareClaim: vi.fn(), approveAndPresent: vi.fn(), confirmClean: vi.fn(), decide: vi.fn() }))
vi.mock('@/features/negotiation/actions', () => ({ confirmSettlementForShop: vi.fn() }))
vi.mock('@/hooks/use-look-again', () => ({ useLookAgain: () => undefined }))
const workspace: ClaimWorkspace = { protectedReply: false, agreedIncidents: [], rentalId: 'rental', rentalState: 'inspecting', currency: 'EUR', simulated: false, reservedCents: 30000, holdState: 'placed', claim: null, prices: [{ id: 'price', description: 'Scratch', amountCents: 3500 }], possibleFindings: [], lines: [], payments: [], invoices: [], execution: null, replies: [], decisions: [], amounts: { capture: { cents: 0, currency: 'EUR' }, release: { cents: 30000, currency: 'EUR' }, invoice: { cents: 0, currency: 'EUR' } } }
describe('claim preparation and settlement screen', () => {
  it('links the shared claim record from staff review', () => {
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={workspace} canAct={false} />)
    expect(screen.getByRole('link', { name: 'Your rental record' })).toHaveAttribute('href', '/shop/rentals/rental/record')
  })
  it('offers separate staff confirmation for a clean return and evidence-backed claim preparation', () => {
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={workspace} canAct />)
    expect(screen.getByLabelText('Inspection reason')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm clean return and release hold' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prepare claim for review' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /amount/i })).not.toBeInTheDocument()
  })
  it('shows the stored settlement amounts and leaves read-only staff no money controls', () => {
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={{ ...workspace, claim: { id: 'claim', state: 'awaiting_approval', totalCents: 3500, raisedByUserId: 'staff', replyDueAt: null }, amounts: { ...workspace.amounts, capture: { cents: 3500, currency: 'EUR' }, release: { cents: 26500, currency: 'EUR' } } }} canAct={false} />)
    expect(screen.getByText('€35.00')).toBeInTheDocument()
    expect(screen.getByText('€265.00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve|release/i })).not.toBeInTheDocument()
  })
})

describe('a claim argued by the advocates', () => {
  const at = new Date('2026-11-01T10:00:00Z')
  const transcript = { id: 'negotiation', kind: 'negotiation' as const, state: 'agreed' as const, endedReason: null, currency: 'EUR', claimTotalCents: 3500, agreedCents: 1750, deadline: at, roundLimit: 6, shopConfirmedAt: null, renterConfirmedAt: null, simulated: true, chainVerified: true, lines: [{ lineId: 'line', publishedCents: 3500, description: 'Scratch' }], wearClauses: [], moves: [{ sequence: 1, side: 'shop' as const, kind: 'offer' as const, lines: [{ lineId: 'line', cents: 3500, ground: null, evidence: [] }], totalCents: 3500, passReason: null, actor: 'referee', model: null, createdAt: at, fingerprint: 'a'.repeat(64) }] }
  const claimed = (state: 'agreed' | 'escalated') => ({ ...workspace, claim: { id: 'claim', state, totalCents: 3500, raisedByUserId: 'staff', replyDueAt: at } })

  it('asks the owner or a manager to confirm what the advocates agreed', () => {
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={claimed('agreed')} canAct negotiation={{ transcript, awaitingShop: true }} />)
    expect(screen.getByRole('heading', { name: 'What the advocates said' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm and settle' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Uphold claim and settle' })).not.toBeInTheDocument()
  })

  it('says, once the shop confirmed, that the agreement waits for the renter', () => {
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={claimed('agreed')} canAct negotiation={{ transcript: { ...transcript, shopConfirmedAt: at }, awaitingShop: false }} />)
    expect(screen.getByText('Waiting for the renter to confirm.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm and settle' })).not.toBeInTheDocument()
  })

  it('lets the owner decide an escalated claim, with the transcript beside it', () => {
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={claimed('escalated')} canAct negotiation={{ transcript: { ...transcript, state: 'escalated', endedReason: 'pass', agreedCents: null }, awaitingShop: false }} />)
    expect(screen.getByText('One advocate passed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Uphold claim and settle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Waive claim and release hold' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm and settle' })).not.toBeInTheDocument()
  })
})

it('shows paired evidence photographs before a staff approval', () => {
  renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={{ ...workspace, claim: { id: 'claim', state: 'awaiting_approval', totalCents: 3500, raisedByUserId: 'staff', replyDueAt: null }, lines: [{ id: 'line', amountCents: 3500, description: 'Scratch', reason: null, actorName: null, findingId: 'finding', findingDescription: 'New scratch', incidentDescription: null, source: 'finding', incidentId: null, region: null, beforeKey: 'before', afterKey: 'after' }] }} canAct photoUrls={{ before: '/before.jpg', after: '/after.jpg' }} />)
  expect(screen.getByRole('img', { name: 'At handover' })).toHaveAttribute('src', '/before.jpg')
  expect(screen.getByRole('img', { name: 'At return' })).toHaveAttribute('src', '/after.jpg')
})

it('lets an eligible person uphold a contested protected claim after its capture failed', () => {
  renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={{ ...workspace, protectedReply: true, claim: { id: 'claim', state: 'charge_failed', totalCents: 3500, raisedByUserId: 'staff', replyDueAt: new Date('2026-10-22') }, replies: [{ decision: 'contest', comment: 'Already marked.' }] }} canAct />)
  expect(screen.getByRole('button', { name: 'Uphold claim and settle' })).toBeInTheDocument()
})

// Found on 26 October 2026: an owner signed in with an emailed code pressed release and read only "Confirm with your
// passkey first", with nothing on the page to confirm with.
it('asks a person whose session an emailed code proved to confirm with a passkey before any money decision', () => {
  renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={workspace} canAct passkey={{ needed: true, hasPasskey: true, email: 'tomas@ribeirabikes.example' }} />)
  expect(screen.getByRole('button', { name: 'Confirm with my passkey' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Confirm clean return and release hold' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Prepare claim for review' })).toBeInTheDocument()
})

describe('a line the renter agreed during the rental (X5.3)', () => {
  const agreed = { ...workspace, agreedIncidents: [{ id: 'incident', description: 'A scratch on the left side', agreedCents: 3500, priceDescription: 'Scratch', itemLabel: 'City e-bike 1' }] }
  const lines = (container: HTMLElement) => JSON.parse(container.querySelector<HTMLInputElement>('input[name="lines"]')?.value ?? '[]') as unknown
  it('is carried into the draft at its agreed amount, in the renter’s words', () => {
    const { container } = renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={agreed} canAct />)
    expect(screen.getByText('A scratch on the left side')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Keep the line the renter agreed: Scratch/ })).toBeChecked()
    expect(lines(container)).toEqual([{ incidentId: 'incident', amountCents: 3500 }])
  })
  it('may be lowered or left out, and is never sent raised', () => {
    const { container } = renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={agreed} canAct />)
    const amount = screen.getByLabelText('Amount to keep, at most €35.00')
    fireEvent.change(amount, { target: { value: '20' } })
    expect(lines(container)).toEqual([{ incidentId: 'incident', amountCents: 2000 }])
    fireEvent.change(amount, { target: { value: '40' } })
    expect(screen.getByText('A line the renter agreed can be lowered, never raised.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prepare claim for review' })).toBeDisabled()
    fireEvent.change(amount, { target: { value: '35' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Keep the line the renter agreed/ }))
    expect(lines(container)).toEqual([])
  })
  it('shows a drafted agreed line as agreed by the renter', () => {
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={{ ...agreed, claim: { id: 'claim', state: 'awaiting_approval', totalCents: 2000, raisedByUserId: 'staff', replyDueAt: null }, lines: [{ id: 'line', amountCents: 2000, description: 'Scratch', reason: null, actorName: 'Ana', findingId: null, findingDescription: null, incidentDescription: 'A scratch on the left side', source: 'agreed_in_rental', incidentId: 'incident', region: null, beforeKey: null, afterKey: null }] }} canAct />)
    expect(screen.getByText('Agreed by the renter during the rental, confirmed by staff at the return.')).toBeInTheDocument()
    expect(screen.getByText('A scratch on the left side')).toBeInTheDocument()
  })
})
