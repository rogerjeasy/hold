import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { recordedRun } from '@/features/negotiation/recorded-run'
import recorded from '@/test/recorded-advocates-run.json'
import { ClaimScreen } from './claim-screen'
import type { ClaimWorkspace } from '@hold/db'
vi.mock('./actions', () => ({ prepareClaim: vi.fn(), approveAndPresent: vi.fn(), confirmClean: vi.fn(), decide: vi.fn() }))
vi.mock('@/features/negotiation/actions', () => ({ confirmSettlementForShop: vi.fn(), argueSampleClaim: vi.fn() }))
vi.mock('@/features/promise/actions', () => ({ writeToRenter: vi.fn() }))
vi.mock('@/features/promise/renter-actions', () => ({ writeToShop: vi.fn() }))
vi.mock('@/hooks/use-look-again', () => ({ useLookAgain: () => undefined }))
const workspace: ClaimWorkspace = { protectedReply: false, agreedIncidents: [], rentalId: 'rental', rentalState: 'inspecting', currency: 'EUR', simulated: false, reservedCents: 30000, holdState: 'placed', claim: null, prices: [{ id: 'price', description: 'Scratch', amountCents: 3500 }], possibleFindings: [], lines: [], payments: [], invoices: [], execution: null, replies: [], decisions: [], amounts: { capture: { cents: 0, currency: 'EUR' }, release: { cents: 30000, currency: 'EUR' }, invoice: { cents: 0, currency: 'EUR' } } }
describe('claim preparation and settlement screen', () => {
  const waiting = { ...workspace, simulated: true, claim: { id: 'claim', state: 'presented' as const, totalCents: 5000, raisedByUserId: 'staff', replyDueAt: new Date('2026-12-08T09:00:00Z') } }
  const oneLeft = { allowance: { left: 1, refusal: null }, recording: undefined }
  it('offers the owner or a manager the two advocates on a sample claim that waits for its reply, and on nothing else', () => {
    const { unmount } = renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={waiting} canAct canDecide sampleAdvocates={oneLeft} />)
    expect(screen.getByRole('button', { name: 'Let the advocates argue it' })).toBeInTheDocument()
    expect(screen.getByText(/1 live run left today/)).toBeInTheDocument()
    unmount()
    const real = renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={{ ...waiting, simulated: false }} canAct canDecide sampleAdvocates={oneLeft} />)
    expect(screen.queryByRole('button', { name: 'Let the advocates argue it' })).not.toBeInTheDocument()
    real.unmount()
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={waiting} canAct canDecide={false} sampleAdvocates={oneLeft} />)
    expect(screen.queryByRole('button', { name: 'Let the advocates argue it' })).not.toBeInTheDocument()
  })
  // The server reads the day's allowance for every view of the page, so a reload says the same as the refusal did.
  it('says which share of the day is spent instead of offering a run that would be refused', () => {
    for (const [refusal, words] of [['daily_cap_shop', /This demo has used its live run/], ['daily_cap_network', /Your network has used its live runs/], ['daily_cap', /across every demo, are used/]] as const) {
      const { unmount } = renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={waiting} canAct canDecide sampleAdvocates={{ allowance: { left: 0, refusal }, recording: undefined }} />)
      expect(screen.queryByRole('button', { name: 'Let the advocates argue it' })).not.toBeInTheDocument()
      expect(screen.getByText('No live run left today')).toBeInTheDocument()
      expect(screen.getByText(words)).toBeInTheDocument()
      unmount()
    }
  })
  it('shows a recorded live run, labelled as one and not this demo’s claim, until a live run of its own exists', () => {
    const recording = recordedRun(recorded)
    const { unmount } = renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={waiting} canAct canDecide sampleAdvocates={{ allowance: { left: 0, refusal: 'daily_cap' }, recording }} />)
    expect(screen.getByText('A recorded live run')).toBeInTheDocument()
    expect(screen.getByText(/not this demo's claim/)).toBeInTheDocument()
    expect(screen.getByText(/Model us\.anthropic\.claude-opus-4-6-v1 · prompt advocates-test · 8 calls · 27,632 tokens/)).toBeInTheDocument()
    expect(screen.getByText('The advocates agreed on €25.00. Nothing is charged until each person confirms.')).toBeInTheDocument()
    unmount()
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={waiting} canAct canDecide sampleAdvocates={{ allowance: { left: 1, refusal: null }, recording: undefined }} />)
    expect(screen.queryByText('A recorded live run')).not.toBeInTheDocument()
  })
  // The renter's page says "your reply"; the shop's page names whose reply it waits for (audit finding JW-M3).
  it('tells staff a presented claim waits for the renter, in the shop’s words and not the renter’s', () => {
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={waiting} canAct />)
    expect(screen.getByRole('heading', { name: 'Waiting for the renter’s reply' })).toBeInTheDocument()
    expect(screen.queryByText('Waiting for your reply')).not.toBeInTheDocument()
  })
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
  // In the PayPal sandbox a finding from the demonstration's sample photographs may be billed; it says so where it is chosen.
  it('marks a finding from sample photographs as a sample where staff choose it, and no other finding', () => {
    const possibleFindings = [{ id: 'sample-finding', description: 'A chip in the paint on the down tube.', suggestedPriceEntryId: 'price', comparisonId: 'comparison', view: 'left-side', simulated: true }, { id: 'real-finding', description: 'A bent brake lever.', suggestedPriceEntryId: 'price', comparisonId: 'comparison', view: 'right-side', simulated: false }]
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={{ ...workspace, possibleFindings }} canAct />)
    expect(screen.getByRole('checkbox', { name: 'A chip in the paint on the down tube. Sample' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'A bent brake lever.' })).toBeInTheDocument()
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
  const transcript = { id: 'negotiation', kind: 'negotiation' as const, state: 'agreed' as const, endedReason: null, currency: 'EUR', claimTotalCents: 3500, agreedCents: 1750, deadline: at, roundLimit: 6, shopConfirmedAt: null, renterConfirmedAt: null, simulated: true, sample: false, chainVerified: true, lines: [{ lineId: 'line', publishedCents: 3500, description: 'Scratch' }], wearClauses: [], moves: [{ sequence: 1, side: 'shop' as const, kind: 'offer' as const, lines: [{ lineId: 'line', cents: 3500, ground: null, evidence: [] }], totalCents: 3500, passReason: null, actor: 'referee', model: null, createdAt: at, fingerprint: 'a'.repeat(64) }] }
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

// Found on 28 October 2026: a claim awaiting approval showed two identical passkey prompts, both about prices and staff.
it('asks once, and for the claim, when a person with no passkey yet opens a claim awaiting approval', () => {
  const awaiting = { ...workspace, claim: { id: 'claim', state: 'awaiting_approval' as const, totalCents: 3500, raisedByUserId: 'staff', replyDueAt: null } }
  renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={awaiting} canAct passkey={{ needed: true, hasPasskey: false, email: 'tomas@ribeirabikes.example' }} />)
  expect(screen.getAllByRole('heading', { name: 'Confirm it is you.' })).toHaveLength(1)
  expect(screen.getByText(/Approving a claim or releasing a hold needs your passkey/)).toBeInTheDocument()
  expect(screen.queryByText(/prices, staff or PayPal/)).not.toBeInTheDocument()
})

it('says a sample claim is a sample, and shows its two photographs with the new mark outlined', () => {
  const sample = { ...workspace, simulated: true, rentalState: 'settling' as const, claim: { id: 'claim', state: 'awaiting_approval' as const, totalCents: 3500, raisedByUserId: 'staff', replyDueAt: null }, lines: [{ id: 'line', amountCents: 3500, description: 'Scratch on the frame, through the paint', reason: null, actorName: 'Tomás', findingId: 'finding', source: 'finding' as const, incidentId: null, findingDescription: 'A chip in the paint on the down tube.', incidentDescription: null, region: { x: 0.36, y: 0.5, width: 0.08, height: 0.16 }, beforeKey: 'sample/sample-handover.jpg', afterKey: 'sample/sample-return-damage.jpg' }] }
  renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={sample} canAct={false} photoUrls={{ 'sample/sample-handover.jpg': '/images/sample-handover.jpg', 'sample/sample-return-damage.jpg': '/images/sample-return-damage.jpg' }} />)
  expect(screen.getByText('A sample rental')).toBeInTheDocument()
  expect(screen.getByText('A chip in the paint on the down tube.')).toBeInTheDocument()
  expect(screen.getAllByRole('img').map((image) => image.getAttribute('src'))).toEqual(expect.arrayContaining([expect.stringContaining('sample-handover.jpg'), expect.stringContaining('sample-return-damage.jpg')]))
})

// A finding's region is in the return photograph's frame. The handover photograph may be turned or zoomed against it,
// so the same box drawn there would outline the wrong place.
it('outlines the finding on the return photograph only', () => {
  const line = { id: 'line', amountCents: 3500, description: 'Scratch', reason: null, actorName: null, findingId: 'finding', findingDescription: 'New scratch', incidentDescription: null, source: 'finding' as const, incidentId: null, region: { x: 0.36, y: 0.5, width: 0.08, height: 0.16 }, beforeKey: 'before', afterKey: 'after' }
  const { container } = renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={{ ...workspace, claim: { id: 'claim', state: 'awaiting_approval', totalCents: 3500, raisedByUserId: 'staff', replyDueAt: null }, lines: [line] }} canAct={false} photoUrls={{ before: '/before.jpg', after: '/after.jpg' }} />)
  const outlined = [...container.querySelectorAll('figure')].filter((figure) => figure.querySelector('[data-mark="line"]') !== null)
  expect(outlined.map((figure) => figure.querySelector('img')?.getAttribute('src'))).toEqual(['/after.jpg'])
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

// Found in the audit: after a return with possible new damage, the one orange button above the fold released the hold.
describe('a return with possible new damage (F-M10)', () => {
  const possibleFindings = [{ id: 'finding', description: 'A chip in the paint on the down tube.', suggestedPriceEntryId: 'price', comparisonId: 'comparison', view: 'left-side', simulated: false }]
  it('leads with preparing the claim, and releases the hold only on a second, quieter step', () => {
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={{ ...workspace, possibleFindings }} canAct />)
    const prepare = screen.getByRole('button', { name: 'Prepare claim for review' })
    expect(prepare).toHaveAttribute('data-variant', 'default')
    expect(screen.queryByRole('button', { name: 'Confirm clean return and release hold' })).not.toBeInTheDocument()
    const anyway = screen.getByRole('button', { name: 'Release the hold without a claim' })
    expect(anyway).toHaveAttribute('data-variant', 'outline')
    expect(prepare.compareDocumentPosition(anyway) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(anyway)
    expect(screen.getByLabelText('Inspection reason')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm clean return and release hold' })).toHaveAttribute('data-variant', 'outline')
  })
  it('offers the clean release at once when the comparison found nothing new', () => {
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={workspace} canAct />)
    expect(screen.getByRole('button', { name: 'Confirm clean return and release hold' })).toHaveAttribute('data-variant', 'default')
    expect(screen.queryByRole('button', { name: 'Release the hold without a claim' })).not.toBeInTheDocument()
  })
})

// Found in the audit (JW-M4): counter staff were shown claim decisions the server would refuse them.
describe('decisions a person may not take', () => {
  const counter = { userId: 'jonas', role: 'counter_staff' as const, approvalLimitCents: 2000, staffCount: 3 }
  const owner = { userId: 'tomas', role: 'owner' as const, approvalLimitCents: 0, staffCount: 3 }
  const awaiting = (totalCents: number) => ({ ...workspace, claim: { id: 'claim', state: 'awaiting_approval' as const, totalCents, raisedByUserId: 'staff', replyDueAt: null } })
  const contested = { ...workspace, rentalState: 'settling' as const, claim: { id: 'claim', state: 'contested' as const, totalCents: 3500, raisedByUserId: 'staff', replyDueAt: null } }

  it('tells counter staff a claim over their limit is for an owner or manager, and offers the owner the approval', () => {
    const { unmount } = renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={awaiting(3500)} canAct viewer={counter} />)
    expect(screen.queryByRole('button', { name: 'Approve and show renter link' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Waive claim and release hold' })).not.toBeInTheDocument()
    expect(screen.getByText('This claim is over your approval limit of €20.00, so an owner or manager approves it.')).toBeInTheDocument()
    unmount()
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={awaiting(3500)} canAct canDecide viewer={owner} />)
    expect(screen.getByRole('button', { name: 'Approve and show renter link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Waive claim and release hold' })).toBeInTheDocument()
    expect(screen.queryByText(/over your approval limit/)).not.toBeInTheDocument()
  })

  it('lets counter staff approve a claim within their limit', () => {
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={awaiting(1500)} canAct viewer={counter} />)
    expect(screen.getByRole('button', { name: 'Approve and show renter link' })).toBeInTheDocument()
  })

  it('leaves a contested claim to an owner or manager', () => {
    const { unmount } = renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={contested} canAct viewer={counter} />)
    expect(screen.queryByRole('button', { name: 'Uphold claim and settle' })).not.toBeInTheDocument()
    expect(screen.getByText('An owner or manager decides a contested claim.')).toBeInTheDocument()
    unmount()
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={contested} canAct canDecide viewer={owner} />)
    expect(screen.getByRole('button', { name: 'Uphold claim and settle' })).toBeInTheDocument()
  })
})

describe('the promise to decide a contested claim', () => {
  const decideBy = new Date('2026-11-03T17:00:00Z')
  const contested = (state: 'contested' | 'escalated') => ({ ...workspace, rentalState: 'settling' as const, claim: { id: 'claim', state, totalCents: 3500, raisedByUserId: 'staff', replyDueAt: null } })
  const open = { days: 3, decideBy, decidedAt: null, missedAt: null, standing: 'open' as const, missedReason: null }
  const messages = [{ id: 'm1', author: 'renter', authorName: null, body: 'It was there at pickup.', createdAt: new Date('2026-11-01T09:00:00Z') }]

  it('shows staff the date they promised and the renter’s messages, with a box to answer', () => {
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={contested('contested')} canAct canDecide promise={open} messages={messages} renterName="Lena Brandt" now={new Date('2026-11-01T10:00:00Z')} />)
    expect(screen.getByText('You promised to decide by')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Messages with Lena Brandt' })).toBeInTheDocument()
    expect(screen.getByText('It was there at pickup.')).toBeInTheDocument()
    expect(screen.getByLabelText('Write to Lena Brandt')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Uphold claim and settle' })).toBeInTheDocument()
  })

  it('once the date passed, leaves the decision to the owner, who is told the renter reads the reason', () => {
    const missed = { ...open, standing: 'missed' as const, missedAt: decideBy }
    const { unmount } = renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={contested('escalated')} canAct canDecide promise={missed} messages={[]} renterName="Lena Brandt" isOwner={false} />)
    expect(screen.getByText('Promise missed')).toBeInTheDocument()
    expect(screen.getByText('The promised date passed, so only the owner can decide this claim now.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Uphold claim and settle' })).not.toBeInTheDocument()
    unmount()
    renderWithIntl(<ClaimScreen shopName="Ribeira Bikes" data={contested('escalated')} canAct canDecide promise={missed} messages={[]} renterName="Lena Brandt" isOwner />)
    expect(screen.getByRole('button', { name: 'Uphold claim and settle' })).toBeInTheDocument()
    expect(screen.getByText('The renter will read this reason on their claim page.')).toBeInTheDocument()
  })
})
