import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ConditionScreen } from './condition-screen'
import type { ConditionView } from './condition-screen'

const confirmCondition = vi.fn()
vi.mock('./actions', () => ({ confirmCondition: (...args: unknown[]) => confirmCondition(...args) as unknown, sendMissed: vi.fn(), requestMissedUpload: vi.fn(), confirmMissedUpload: vi.fn() }))
vi.mock('@/features/records/renter-actions', () => ({ checkEvidence: vi.fn() }))
vi.mock('@/features/handover/photo-taker', () => ({ PhotoTaker: () => <p>Camera</p> }))
vi.mock('@/i18n/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const report = (overrides: Partial<ConditionView> = {}): ConditionView => ({
  shopName: 'Ribeira Bikes',
  timeZone: 'Europe/Lisbon',
  open: true,
  reply: null,
  closesAt: new Date('2026-10-17T10:00:00Z'),
  canReply: true,
  confirmed: null,
  items: [
    {
      itemId: 'item-1',
      label: 'City e-bike 1',
      photos: [{ view: 'left-side', label: 'Left side', url: '/l.jpg', provenance: { takenAt: new Date('2026-10-16T09:14:00Z'), takenBy: 'counter_staff', source: 'camera', sha256: '7ac39badb505d60e5c4c92018f9ae4410ffb80912d2c7fbbc9cd9202990e8080', sealedAt: new Date('2026-10-16T09:20:00Z') } }],
      marks: [{ id: 'mark-1', view: 'left-side', region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, description: 'Scratch on the frame' }],
      added: [],
    },
  ],
  ...overrides,
})

describe('the renter’s condition report', () => {
  it('shows each item’s photographs and marks, and how long the renter has to answer', () => {
    renderWithIntl(<ConditionScreen token="token" report={report()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('How your rental left')
    expect(screen.getByRole('img', { name: 'City e-bike 1: Left side' })).toBeInTheDocument()
    expect(screen.getByText('Scratch on the frame')).toBeInTheDocument()
    expect(screen.getByText(/until Oct 17/)).toBeInTheDocument()
  })

  it('takes the renter’s confirmation that everything is as shown', async () => {
    confirmCondition.mockResolvedValue({ ok: true, value: {} })
    renderWithIntl(<ConditionScreen token="token" report={report()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Everything is as shown' }))
    await waitFor(() => {
      expect(confirmCondition).toHaveBeenCalled()
    })
  })

  it('says under each photograph where it came from, and offers to check the item’s evidence', () => {
    renderWithIntl(<ConditionScreen token="token" report={report()} />)
    expect(screen.getByText('Counter staff')).toBeInTheDocument()
    expect(screen.getByText('Hold’s camera, in the app')).toBeInTheDocument()
    expect(screen.getByText('7ac3 9bad b505 d60e')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check this evidence' })).toBeInTheDocument()
  })

  it('shows the answer given with its time, and asks nothing more', () => {
    renderWithIntl(<ConditionScreen token="token" report={report({ open: false, reply: 'confirmed', confirmed: { reply: 'confirmed', at: new Date('2026-10-16T10:44:00Z') } })} />)
    expect(screen.getByText('You confirmed the handover photographs on Oct 16 at 11:44 AM.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Everything is as shown' })).not.toBeInTheDocument()
  })

  it('only shows the report from a link that cannot answer it', () => {
    renderWithIntl(<ConditionScreen token="token" report={report({ canReply: false })} />)
    expect(screen.queryByRole('button', { name: 'Everything is as shown' })).not.toBeInTheDocument()
    expect(screen.getByText('Answer from the link the shop sent you at handover.')).toBeInTheDocument()
  })
})
