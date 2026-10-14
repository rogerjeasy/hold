import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { AuthForm } from './auth-form'
import type { AuthAction, AuthFormState } from './auth-form-state'
import { readText } from './auth-input'

function answering(state: Partial<AuthFormState>) {
  return vi.fn<AuthAction>((_previous, data) =>
    Promise.resolve({ values: { email: readText(data.get('email')) }, problems: {}, ...state }),
  )
}

describe('AuthForm', () => {
  it('asks someone signing in for their work email only', () => {
    renderWithIntl(<AuthForm kind="signIn" action={answering({})} />)
    expect(screen.getAllByRole('textbox').map((field) => field.getAttribute('name'))).toEqual(['email'])
    expect(screen.getByRole('textbox', { name: 'Work email' })).toHaveAttribute('autocomplete', 'email')
  })

  it('asks a new owner for their name, the shop and their work email', () => {
    renderWithIntl(<AuthForm kind="signUp" action={answering({})} />)
    expect(screen.getAllByRole('textbox').map((field) => field.getAttribute('name'))).toEqual(['name', 'shopName', 'email'])
  })

  it('says there is no password', () => {
    renderWithIntl(<AuthForm kind="signIn" action={answering({})} />)
    expect(screen.getByText('No password. Hold emails you a code that works once.')).toBeInTheDocument()
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
  })

  it('names what is missing, moves to the first problem and sends nothing', async () => {
    const action = answering({})
    renderWithIntl(<AuthForm kind="signUp" action={action} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Your name' }), 'Tomás')
    await userEvent.click(screen.getByRole('button', { name: 'Create my shop account' }))
    const shopName = screen.getByRole('textbox', { name: 'Shop name' })
    expect(shopName).toBeInvalid()
    expect(shopName).toHaveAccessibleDescription("Enter your shop's name.")
    expect(shopName).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Your name' })).toBeValid()
    expect(action).not.toHaveBeenCalled()
  })

  it('refuses an address that is not an email address before sending it', async () => {
    const action = answering({})
    renderWithIntl(<AuthForm kind="signIn" action={action} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Work email' }), 'tomas')
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }))
    expect(screen.getByRole('textbox', { name: 'Work email' })).toHaveAccessibleDescription(
      'That does not look like an email address. Check it and try again.',
    )
    expect(action).not.toHaveBeenCalled()
  })

  it('sends a good address to the server', async () => {
    const action = answering({})
    renderWithIntl(<AuthForm kind="signIn" action={action} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Work email' }), 'tomas@ribeirabikes.example')
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }))
    expect(action).toHaveBeenCalledOnce()
    expect(action.mock.calls[0]?.[1].get('email')).toBe('tomas@ribeirabikes.example')
  })

  it('says plainly when there were too many attempts, and keeps the address in the field', async () => {
    renderWithIntl(<AuthForm kind="signIn" action={answering({ notice: 'busy' })} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Work email' }), 'tomas@ribeirabikes.example')
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Too many attempts.')
    expect(alert).toHaveTextContent('Wait a few minutes, then try again.')
    expect(screen.getByRole('textbox', { name: 'Work email' })).toHaveValue('tomas@ribeirabikes.example')
  })

  it('sends the browser’s time zone with a sign-up', async () => {
    const action = answering({})
    renderWithIntl(<AuthForm kind="signUp" action={action} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Your name' }), 'Tomás')
    await userEvent.type(screen.getByRole('textbox', { name: 'Shop name' }), 'Ribeira Bikes')
    await userEvent.type(screen.getByRole('textbox', { name: 'Work email' }), 'tomas@ribeirabikes.example')
    await userEvent.click(screen.getByRole('button', { name: 'Create my shop account' }))
    expect(action.mock.calls[0]?.[1].get('timeZone')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

  it('shows a problem the server found', async () => {
    renderWithIntl(<AuthForm kind="signIn" action={answering({ problems: { email: 'invalid' } })} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Work email' }), 'tomas@ribeirabikes.example')
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }))
    expect(await screen.findByText('That does not look like an email address. Check it and try again.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
