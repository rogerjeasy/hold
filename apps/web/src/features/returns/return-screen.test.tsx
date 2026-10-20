import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ReturnScreen } from './return-screen'

vi.mock('./actions', () => ({ sealReturn: vi.fn(), requestPhotoUpload: vi.fn(), confirmPhotoUpload: vi.fn() }))
vi.mock('@/hooks/use-look-again', () => ({ useLookAgain: () => undefined }))
vi.mock('@/i18n/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const session = { id: 'session', itemLabel: 'City e-bike', sealed: false, plan: [{ key: 'left-side', label: 'Left side', outline: 'whole_side' as const, required: true }], photos: [], marks: [], missing: ['left-side'], baseline: [{ view: 'left-side', url: '/baseline.jpg' }] }

describe('guided return capture', () => {
  it('labels a saved sample photograph on the capture screen', () => {
    renderWithIntl(<ReturnScreen shopName="Ribeira Bikes" rentalId="rental" session={{ ...session, photos: [{ view: 'left-side', url: '/sample.jpg', simulated: true }], missing: [] }} canAct />)
    expect(screen.getByText('Sample photographs')).toBeInTheDocument()
  })
  it('shows the handover overlay and refuses sealing until required views are photographed', () => {
    renderWithIntl(<ReturnScreen shopName="Ribeira Bikes" rentalId="rental" session={session} canAct />)
    expect(screen.getByRole('img', { name: 'Handover guide: Left side' })).toHaveAttribute('src', '/baseline.jpg')
    expect(screen.getByRole('button', { name: 'Seal return photographs' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add a mark' })).not.toBeInTheDocument()
  })
  it('keeps sealed evidence read-only and explains that comparison follows', () => {
    renderWithIntl(<ReturnScreen shopName="Ribeira Bikes" rentalId="rental" session={{ ...session, sealed: true, photos: [{ view: 'left-side', url: '/return.jpg' }], missing: [] }} canAct />)
    expect(screen.queryByRole('button', { name: 'Seal return photographs' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Take a photograph' })).not.toBeInTheDocument()
    expect(screen.getByText(/These return photographs are sealed/)).toBeInTheDocument()
  })
  it('offers no camera or seal control to a read-only member', () => {
    renderWithIntl(<ReturnScreen shopName="Ribeira Bikes" rentalId="rental" session={session} canAct={false} />)
    expect(screen.queryByRole('button', { name: 'Use the sample photograph' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Seal return photographs' })).not.toBeInTheDocument()
  })
})
