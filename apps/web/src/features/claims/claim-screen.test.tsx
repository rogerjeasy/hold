import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ClaimScreen } from './claim-screen'
import type { ClaimWorkspace } from '@hold/db'
vi.mock('./actions', () => ({ prepareClaim: vi.fn(), approveAndPresent: vi.fn(), confirmClean: vi.fn(), decide: vi.fn() }))
vi.mock('@/hooks/use-look-again', () => ({ useLookAgain: () => undefined }))
const workspace: ClaimWorkspace = { protectedReply: false, rentalId: 'rental', rentalState: 'inspecting', currency: 'EUR', simulated: false, reservedCents: 30000, holdState: 'placed', claim: null, prices: [{ id: 'price', description: 'Scratch', amountCents: 3500 }], possibleFindings: [], lines: [], payments: [], invoices: [], execution: null, replies: [], decisions: [], amounts: { capture: { cents: 0, currency: 'EUR' }, release: { cents: 30000, currency: 'EUR' }, invoice: { cents: 0, currency: 'EUR' } } }
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

it('shows paired evidence photographs before a staff approval', () => {
  renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={{ ...workspace, claim: { id: 'claim', state: 'awaiting_approval', totalCents: 3500, raisedByUserId: 'staff', replyDueAt: null }, lines: [{ id: 'line', amountCents: 3500, description: 'Scratch', reason: null, actorName: null, findingId: 'finding', findingDescription: 'New scratch', region: null, beforeKey: 'before', afterKey: 'after' }] }} canAct photoUrls={{ before: '/before.jpg', after: '/after.jpg' }} />)
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
