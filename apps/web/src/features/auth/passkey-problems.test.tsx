import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { AddPasskey } from './add-passkey'
import { PasskeyButton } from './passkey-button'

const actions = vi.hoisted(() => ({ startPasskeyRegistration: vi.fn(), finishPasskeyRegistration: vi.fn(), startPasskeySignIn: vi.fn(), finishPasskeySignIn: vi.fn() }))
vi.mock('./actions', () => actions)
vi.mock('./passkey-browser', () => ({ passkeysSupported: () => true, askForPasskey: () => Promise.resolve(undefined), makePasskey: () => Promise.resolve(undefined) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

// A refusal says what to do next, never only "try again" (audit finding JW-M7).
describe('what a passkey refusal says', () => {
  it('tells a person whose passkey was not used where else it may be', async () => {
    actions.startPasskeySignIn.mockResolvedValue({ requestOptions: '{}' })
    renderWithIntl(<PasskeyButton email="owner@ribeira.example" label="Confirm with my passkey" returnTo="/shop" />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm with my passkey' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/another device or browser/)
  })

  it('tells a person who already has a passkey to confirm with it on the device that holds it', async () => {
    actions.startPasskeyRegistration.mockResolvedValue({ problem: 'confirm_first' })
    renderWithIntl(<AddPasskey />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey on this device' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/on the device or browser that holds it/)
  })

  it('says no passkey was made when the person closes the prompt while adding one', async () => {
    actions.startPasskeyRegistration.mockResolvedValue({ creationOptions: '{}' })
    renderWithIntl(<AddPasskey />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey on this device' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No passkey was made. Try again when you are ready.')
  })
})
