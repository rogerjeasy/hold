import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import type { CodeAction, CodeFormState } from './auth-form-state'
import { CodeForm } from './code-form'

const answering = (state: CodeFormState) => vi.fn<CodeAction>(() => Promise.resolve(state))
const resending = (state: CodeFormState) => vi.fn(() => Promise.resolve(state))

describe('CodeForm', () => {
  it('names a code that is not digits without sending it', async () => {
    const submit = answering({})
    renderWithIntl(<CodeForm submit={submit} resend={resending({})} />)
    const field = screen.getByRole('textbox', { name: 'Code from the email' })
    await userEvent.type(field, 'abc')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(field).toHaveAccessibleDescription('The code is the digits in the email. Check it and try again.')
    expect(submit).not.toHaveBeenCalled()
  })

  it('sends a code typed with spaces, and shows what the server found', async () => {
    const submit = answering({ problem: 'wrong' })
    renderWithIntl(<CodeForm submit={submit} resend={resending({})} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Code from the email' }), '2468 1357')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(submit).toHaveBeenCalledOnce()
    expect(await screen.findByText('That code is not right. Check it and try again.')).toBeInTheDocument()
  })

  it('says a new code is on its way', async () => {
    renderWithIntl(<CodeForm submit={answering({})} resend={resending({ resent: true })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Send a new code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A new code is on its way.')
  })

  it('offers the phone’s one-time-code fill and a number pad', () => {
    renderWithIntl(<CodeForm submit={answering({})} resend={resending({})} />)
    const field = screen.getByRole('textbox', { name: 'Code from the email' })
    expect(field).toHaveAttribute('autocomplete', 'one-time-code')
    expect(field).toHaveAttribute('inputmode', 'numeric')
  })
})
