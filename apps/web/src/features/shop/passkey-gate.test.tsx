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
})
