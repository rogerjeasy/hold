import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { PasskeyGate } from './passkey-gate'

const gate = { email: 'tomas.demo@hold.example', returnTo: '/shop/queue' }

describe('PasskeyGate', () => {
  it('shows the change itself once no passkey is needed', () => {
    renderWithIntl(<PasskeyGate {...gate} needed={false} hasPasskey>Approve</PasskeyGate>)
    expect(screen.getByText('Approve')).toBeInTheDocument()
  })

  it('asks a person with a passkey to confirm with it, and offers one on a device that has none', () => {
    renderWithIntl(<PasskeyGate {...gate} needed hasPasskey>Approve</PasskeyGate>)
    expect(screen.queryByText('Approve')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm with my passkey' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'No passkey on this device? Add one' })).toHaveAttribute('href', '/shop/security')
  })

  it('sends a person with no passkey to add one', () => {
    renderWithIntl(<PasskeyGate {...gate} needed hasPasskey={false}>Approve</PasskeyGate>)
    expect(screen.getByRole('link', { name: 'Add a passkey' })).toHaveAttribute('href', '/shop/security')
  })

  it('says that a passkey stays on the device that made it', () => {
    renderWithIntl(<PasskeyGate {...gate} needed hasPasskey>Approve</PasskeyGate>)
    expect(screen.getByText('A passkey stays on the device or browser that made it. Use that one, or add a passkey here.')).toBeInTheDocument()
  })

  // A judge who added a passkey in one browser has none in the next (JW-M7): the gate names the ways out.
  it('names the way out on the demo: a fresh demo, or signing out', () => {
    renderWithIntl(<PasskeyGate {...gate} needed hasPasskey demo>Approve</PasskeyGate>)
    expect(screen.getByRole('link', { name: 'Start a fresh demo' })).toHaveAttribute('href', '/sign-in')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm with my passkey' })).toBeInTheDocument()
  })

  it('offers no demo way out outside the demo', () => {
    renderWithIntl(<PasskeyGate {...gate} needed hasPasskey>Approve</PasskeyGate>)
    expect(screen.queryByRole('link', { name: 'Start a fresh demo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('says what the passkey is for, whether or not this device has one', () => {
    const { unmount } = renderWithIntl(<PasskeyGate {...gate} needed hasPasskey={false} body="Approving needs your passkey.">Approve</PasskeyGate>)
    expect(screen.getByText('Approving needs your passkey.')).toBeInTheDocument()
    expect(screen.getByText('There is none on this device yet. Add one first.')).toBeInTheDocument()
    unmount()
    renderWithIntl(<PasskeyGate {...gate} needed hasPasskey body="Approving needs your passkey.">Approve</PasskeyGate>)
    expect(screen.getByText('Approving needs your passkey.')).toBeInTheDocument()
  })
})
