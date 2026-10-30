import type { ItemRepair, PassportMark } from '@hold/db'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { RepairsPanel } from './repairs-panel'

vi.mock('./actions', () => ({ openRepair: vi.fn(), startRepair: vi.fn() }))
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))

const clock = { timeZone: 'Europe/Zurich', currency: 'EUR' }
const views = [{ key: 'left-side', label: 'Left side', outline: 'whole_side' as const, required: true }]
const line = (overrides: Partial<ItemRepair['lines'][number]> = {}): ItemRepair['lines'][number] => ({ id: 'line-1', repairId: 'repair-1', markId: 'mark-1', view: 'left-side', region: { x: 0.3, y: 0.3, width: 0.2, height: 0.1 }, firstSeenSessionId: 'session-1', claimLineId: 'claim-line-1', description: 'Frame scratch, top tube', claimedCents: 90_00, outcome: null, ...overrides })
const repair = (overrides: Partial<ItemRepair> = {}): ItemRepair => ({ id: 'repair-1', state: 'open', claimId: 'claim-1', currency: 'EUR', costCents: null, note: null, createdAt: new Date('2026-11-03T10:00:00Z'), closedAt: null, sessionId: null, sessionSealed: false, opener: null, closer: null, renterName: 'Lena Brandt', lines: [line()], ...overrides })
const mark = (overrides: Partial<PassportMark> = {}): PassportMark => ({ id: 'mark-2', view: 'left-side', description: 'Faint scuff on the down tube', status: 'open', firstSeenAt: new Date('2026-10-12T09:00:00Z'), closedAt: null, ...overrides })

describe('an item’s repairs on its passport', () => {
  it('shows a repair a charge opened, what it covers and was claimed, and the way to photograph it', () => {
    renderWithIntl(<RepairsPanel itemId="item-1" repairs={[repair()]} marks={[mark()]} views={views} clock={clock} canAct itemInService />)
    expect(screen.getByRole('heading', { name: 'Repair to do' })).toBeInTheDocument()
    expect(screen.getByText(/From Lena Brandt’s charged claim/)).toBeInTheDocument()
    expect(screen.getByText('Frame scratch, top tube')).toBeInTheDocument()
    expect(screen.getByText('€90.00 claimed')).toBeInTheDocument()
    expect(screen.getByText(/can still be rented/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Photograph the repair' })).toBeInTheDocument()
  })

  it('offers to open a repair for open marks no repair covers yet', () => {
    renderWithIntl(<RepairsPanel itemId="item-1" repairs={[repair()]} marks={[mark(), mark({ id: 'mark-1', description: 'Frame scratch, top tube' })]} views={views} clock={clock} canAct itemInService />)
    expect(screen.getByRole('checkbox', { name: /Faint scuff on the down tube/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Frame scratch, top tube/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open a repair' })).toBeInTheDocument()
  })

  it('lists repairs done with what they cost against what was claimed', () => {
    renderWithIntl(<RepairsPanel itemId="item-1" repairs={[repair({ state: 'done', costCents: 62_00, closedAt: new Date('2026-11-04T15:00:00Z'), closer: 'Jonas', lines: [line({ outcome: 'repaired' })] })]} marks={[]} views={views} clock={clock} canAct itemInService />)
    expect(screen.getByRole('heading', { name: 'Repairs' })).toBeInTheDocument()
    expect(screen.getByText(/Repaired by Jonas/)).toBeInTheDocument()
    expect(screen.getByText('€62.00')).toBeInTheDocument()
    expect(screen.getByText('€90.00')).toBeInTheDocument()
  })

  it('shows read-only members the repairs and no controls', () => {
    renderWithIntl(<RepairsPanel itemId="item-1" repairs={[repair()]} marks={[mark()]} views={views} clock={clock} canAct={false} itemInService />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows nothing when there is no repair and no open mark', () => {
    const { container } = renderWithIntl(<RepairsPanel itemId="item-1" repairs={[]} marks={[]} views={views} clock={clock} canAct itemInService />)
    expect(container).toBeEmptyDOMElement()
  })
})
