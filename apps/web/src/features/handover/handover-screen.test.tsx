import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { HandoverScreen } from './handover-screen'
import type { HandoverView } from './handover-screen'

const sealHandover = vi.fn()
vi.mock('./actions', () => ({ sealHandover: (...args: unknown[]) => sealHandover(...args) as unknown, addHandoverMark: vi.fn(), confirmKnownMarks: vi.fn(), requestPhotoUpload: vi.fn(), confirmPhotoUpload: vi.fn() }))
vi.mock('./photo-taker', () => ({ PhotoTaker: ({ view }: { view: { label: string } }) => <p>Camera for {view.label}</p> }))
vi.mock('@/i18n/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const RENTAL = '00000000-0000-4000-8000-0000000000a3'
const session = (overrides: Partial<HandoverView> = {}): HandoverView => ({
  id: 'session-1',
  itemLabel: 'City e-bike 1',
  sealed: false,
  plan: [
    { key: 'left-side', label: 'Left side', outline: 'whole_side', required: true },
    { key: 'right-side', label: 'Right side', outline: 'whole_side', required: true },
    { key: 'battery', label: 'Battery', outline: 'detail', required: false },
  ],
  photos: [{ view: 'left-side', url: '/display/left.jpg' }],
  marks: [],
  missing: ['right-side'],
  ...overrides,
})

describe('the handover screen', () => {
  it('lists each view with what is done and what is still needed, and opens the first one missing', () => {
    renderWithIntl(<HandoverScreen shopName="Ribeira Bikes" rentalId={RENTAL} session={session()} />)
    const views = screen.getByRole('list', { name: 'Views' })
    expect(views).toHaveTextContent('Left side')
    expect(views).toHaveTextContent('Photographed')
    expect(views).toHaveTextContent('Optional')
    expect(screen.getByText('Camera for Right side')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Seal the photographs' })).toBeDisabled()
  })

  it('seals once every required view is photographed, and shows the renter’s condition report when the rental is out', async () => {
    sealHandover.mockResolvedValue({ ok: true, value: { rentalOut: true, conditionLink: { url: 'https://hold.test/r/abc/condition', qr: '<svg></svg>', sent: 'text' } } })
    renderWithIntl(<HandoverScreen shopName="Ribeira Bikes" rentalId={RENTAL} session={session({ photos: [{ view: 'left-side', url: '/l.jpg' }, { view: 'right-side', url: '/r.jpg' }], missing: [] })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Seal the photographs' }))
    await waitFor(() => {
      expect(screen.getByText('The rental is out.')).toBeInTheDocument()
    })
    expect(screen.getByText('The renter has been texted the condition report. They can also scan this code.')).toBeInTheDocument()
    expect(screen.getByTestId('renter-link')).toHaveTextContent('https://hold.test/r/abc/condition')
  })

  it('shows a sealed handover without the camera, and changes nothing on it', () => {
    renderWithIntl(<HandoverScreen shopName="Ribeira Bikes" rentalId={RENTAL} session={session({ sealed: true, missing: [], photos: [{ view: 'left-side', url: '/l.jpg' }, { view: 'right-side', url: '/r.jpg' }] })} />)
    expect(screen.queryByText(/Camera for/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Seal the photographs' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a mark' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Take it again' })).not.toBeInTheDocument()
    expect(screen.getByText('Sealed. These photographs can no longer change.')).toBeInTheDocument()
  })

  it('keeps showing the renter’s code after the page is drawn again as sealed', async () => {
    sealHandover.mockResolvedValue({ ok: true, value: { rentalOut: true, conditionLink: { url: 'https://hold.test/r/abc/condition', qr: '<svg></svg>', sent: null } } })
    const ready = session({ photos: [{ view: 'left-side', url: '/l.jpg' }, { view: 'right-side', url: '/r.jpg' }], missing: [] })
    const { rerender } = renderWithIntl(<HandoverScreen shopName="Ribeira Bikes" rentalId={RENTAL} session={ready} />)
    await userEvent.click(screen.getByRole('button', { name: 'Seal the photographs' }))
    await screen.findByText('The rental is out.')
    rerender(<HandoverScreen shopName="Ribeira Bikes" rentalId={RENTAL} session={{ ...ready, sealed: true }} />)
    expect(screen.getByText('The rental is out.')).toBeInTheDocument()
    expect(screen.getByTestId('renter-link')).toHaveTextContent('https://hold.test/r/abc/condition')
  })
})
