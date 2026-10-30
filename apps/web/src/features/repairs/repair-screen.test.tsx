import type { ItemRepair } from '@hold/db'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { RepairScreen } from './repair-screen'

vi.mock('./actions', () => ({ startRepair: vi.fn(), finishRepair: vi.fn(), requestPhotoUpload: vi.fn(), confirmPhotoUpload: vi.fn() }))
vi.mock('@/hooks/use-look-again', () => ({ useLookAgain: () => undefined }))
vi.mock('@/i18n/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const clock = { timeZone: 'Europe/Zurich', currency: 'EUR' }
const line = (overrides: Partial<ItemRepair['lines'][number]> = {}): ItemRepair['lines'][number] => ({ id: 'line-1', repairId: 'repair-1', markId: 'mark-1', view: 'left-side', region: { x: 0.3, y: 0.3, width: 0.2, height: 0.1 }, firstSeenSessionId: 'session-1', claimLineId: 'claim-line-1', description: 'Frame scratch, top tube', claimedCents: 90_00, outcome: null, ...overrides })
const repair = (overrides: Partial<ItemRepair> = {}): ItemRepair => ({ id: 'repair-1', state: 'open', claimId: 'claim-1', currency: 'EUR', costCents: null, note: null, createdAt: new Date('2026-11-03T10:00:00Z'), closedAt: null, sessionId: 'session-2', sessionSealed: false, opener: null, closer: null, renterName: 'Lena Brandt', lines: [line(), line({ id: 'line-2', markId: null, view: null, region: null, description: 'The bell is missing.' })], ...overrides })
const session = { id: 'session-2', itemLabel: 'Cube Touring 54', sealed: false, plan: [{ key: 'left-side', label: 'Left side', outline: 'whole_side' as const, required: true }], photos: [], marks: [], missing: ['left-side'] }
const guides = [{ view: 'left-side', url: '/scratch.jpg', region: { x: 0.3, y: 0.3, width: 0.2, height: 0.1 }, description: 'Frame scratch, top tube' }]
const common = { shopName: 'Alpine Rentals', itemId: 'item-1', itemLabel: 'Cube Touring 54', clock, guides, canAct: true }

describe('photographing and closing a repair', () => {
  it('shows where the mark was beside the camera, and asks what was done to each line and what it cost', () => {
    renderWithIntl(<RepairScreen {...common} repair={repair()} session={session} />)
    expect(screen.getByRole('img', { name: 'Where the mark was: Frame scratch, top tube' })).toHaveAttribute('src', '/scratch.jpg')
    expect(screen.getByRole('button', { name: 'Use the sample photograph' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Frame scratch, top tube' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio', { name: 'Repaired' })).toHaveLength(2)
    expect(screen.getAllByRole('radio', { name: 'Left as is' })).toHaveLength(2)
    expect(screen.getByLabelText('What the repair cost, in EUR')).toBeInTheDocument()
    expect(screen.getByText('Photograph every view above first.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close the repair' })).toBeDisabled()
  })

  it('lets staff close it once every view is photographed', () => {
    renderWithIntl(<RepairScreen {...common} repair={repair()} session={{ ...session, photos: [{ view: 'left-side', url: '/repaired.jpg' }], missing: [] }} />)
    expect(screen.getByRole('button', { name: 'Close the repair' })).toBeEnabled()
  })

  it('needs no camera when nothing has a mark', () => {
    renderWithIntl(<RepairScreen {...common} guides={[]} repair={repair({ sessionId: null, lines: [line({ markId: null, view: null, region: null })] })} session={null} />)
    expect(screen.getByText('Nothing on this repair has a mark to photograph.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close the repair' })).toBeEnabled()
  })

  it('shows a closed repair with its cost and no controls', () => {
    renderWithIntl(<RepairScreen {...common} repair={repair({ state: 'done', costCents: 62_00, closedAt: new Date('2026-11-04T15:00:00Z'), closer: 'Jonas', sessionSealed: true, lines: [line({ outcome: 'repaired' })] })} session={{ ...session, sealed: true, photos: [{ view: 'left-side', url: '/repaired.jpg' }], missing: [] }} />)
    expect(screen.getByText('Repair closed')).toBeInTheDocument()
    expect(screen.getByText('€62.00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close the repair' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use the sample photograph' })).not.toBeInTheDocument()
  })
})
