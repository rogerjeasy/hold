import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import type { DemoFormState } from './auth-form-state'
import { DemoAccountsForm } from './demo-accounts-form'

const answered = vi.fn<() => Promise<DemoFormState>>()
vi.mock('./actions', () => ({ signInWithDemoAccount: () => answered() }))

describe('the demo’s one tap', () => {
  it('says plainly when today’s demos are all taken, and that nothing was made', async () => {
    answered.mockResolvedValueOnce({ notice: 'demo_cap' })
    renderWithIntl(<DemoAccountsForm demo="new" />)

    await userEvent.click(screen.getByRole('button', { name: 'Start a demo as Tomás, the owner' }))

    const notice = within(await screen.findByRole('alert'))
    expect(notice.getByText('Today’s demos are all taken.')).toBeInTheDocument()
    expect(notice.getByText(/New ones open at midnight UTC\. Nothing was made\./)).toBeInTheDocument()
  })

  it('says plainly when the demo this browser kept has ended, and offers a fresh one', async () => {
    answered.mockResolvedValueOnce({ notice: 'demo_ended' })
    renderWithIntl(<DemoAccountsForm demo="current" />)

    await userEvent.click(screen.getByRole('button', { name: 'Continue as Jonas, at the counter' }))

    const notice = within(await screen.findByRole('alert'))
    expect(notice.getByText('This demo has ended.')).toBeInTheDocument()
    expect(notice.getByText(/kept for seven days/)).toBeInTheDocument()
  })

  it('says what it is doing while a new demo is set up, so the long wait never looks like nothing', async () => {
    answered.mockReturnValueOnce(new Promise<DemoFormState>(() => undefined))
    renderWithIntl(<DemoAccountsForm demo="new" />)

    await userEvent.click(screen.getByRole('button', { name: 'Start a demo as Tomás, the owner' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Setting up your shop, its two accounts and its sample rentals. This takes about 20 seconds.')
  })

  it('says it is signing in when coming back to a demo, which is quick', async () => {
    answered.mockReturnValueOnce(new Promise<DemoFormState>(() => undefined))
    renderWithIntl(<DemoAccountsForm demo="current" />)

    await userEvent.click(screen.getByRole('button', { name: 'Continue as Jonas, at the counter' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Signing you in to your demo…')
  })
})
