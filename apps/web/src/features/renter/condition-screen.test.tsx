import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ConditionScreen } from './condition-screen'
import type { ConditionView } from './condition-screen'

const confirmCondition = vi.fn()
vi.mock('./actions', () => ({ confirmCondition: (...args: unknown[]) => confirmCondition(...args) as unknown, sendMissed: vi.fn(), requestMissedUpload: vi.fn(), confirmMissedUpload: vi.fn() }))
vi.mock('@/features/handover/photo-taker', () => ({ PhotoTaker: () => <p>Camera</p> }))
vi.mock('@/i18n/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const report = (overrides: Partial<ConditionView> = {}): ConditionView => ({
  shopName: 'Ribeira Bikes',
  timeZone: 'Europe/Lisbon',
  open: true,
  reply: null,
  closesAt: new Date('2026-10-17T10:00:00Z'),
  canReply: true,
  items: [
    {
      itemId: 'item-1',
      label: 'City e-bike 1',
      photos: [{ view: 'left-side', label: 'Left side', url: '/l.jpg' }],
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

  it('shows the answer given, and asks nothing more', () => {
    renderWithIntl(<ConditionScreen token="token" report={report({ open: false, reply: 'confirmed' })} />)
    expect(screen.getByText('You confirmed the photographs.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Everything is as shown' })).not.toBeInTheDocument()
  })

  it('only shows the report from a link that cannot answer it', () => {
    renderWithIntl(<ConditionScreen token="token" report={report({ canReply: false })} />)
    expect(screen.queryByRole('button', { name: 'Everything is as shown' })).not.toBeInTheDocument()
    expect(screen.getByText('Answer from the link the shop sent you at handover.')).toBeInTheDocument()
  })
})
