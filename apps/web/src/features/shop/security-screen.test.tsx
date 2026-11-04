import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { SecurityScreen } from './security-screen'
vi.mock('@/features/auth/actions', () => ({ startPasskeyRegistration: vi.fn(), finishPasskeyRegistration: vi.fn(), startPasskeySignIn: vi.fn(), finishPasskeySignIn: vi.fn(), signOut: vi.fn() }))

const passkeys = [{ id: 'key', name: 'Laptop', createdAt: new Date('2026-11-01T10:00:00Z') }]
const screenFor = (props: { confirmedByPasskey: boolean; demo: boolean; passkeys?: typeof passkeys }) => <SecurityScreen shopName="Ribeira Bikes" passkeys={props.passkeys ?? passkeys} required email="owner@ribeira.example" confirmedByPasskey={props.confirmedByPasskey} demo={props.demo} />

// The server lets a person add a passkey only once a passkey proved the session or the account has none, so the page
// offers what the server would take, and names the way out in place of a button it would refuse (audit finding JW-M7).
describe('the security page', () => {
  it('asks a demo session whose account has a passkey to confirm with it, and names a fresh demo as the way out', () => {
    renderWithIntl(screenFor({ confirmedByPasskey: false, demo: true }))
    expect(screen.queryByRole('button', { name: 'Add a passkey on this device' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm with my passkey' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start a fresh demo' })).toHaveAttribute('href', '/sign-in')
  })

  it('does not send a person back to this page to add the passkey this page is asking for', () => {
    renderWithIntl(screenFor({ confirmedByPasskey: false, demo: false }))
    expect(screen.getByRole('button', { name: 'Confirm with my passkey' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'No passkey on this device? Add one' })).not.toBeInTheDocument()
    expect(screen.getByText(/Confirm on the device or browser that holds it/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Start a fresh demo' })).not.toBeInTheDocument()
  })

  it('offers to add a passkey once one proved the session, and to an account that has none', () => {
    const { unmount } = renderWithIntl(screenFor({ confirmedByPasskey: true, demo: true }))
    expect(screen.getByRole('button', { name: 'Add a passkey on this device' })).toBeInTheDocument()
    unmount()
    renderWithIntl(screenFor({ confirmedByPasskey: false, demo: true, passkeys: [] }))
    expect(screen.getByRole('button', { name: 'Add a passkey on this device' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm with my passkey' })).not.toBeInTheDocument()
  })
})
