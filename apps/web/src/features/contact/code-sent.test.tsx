import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { CodeSent } from './code-sent'

const words = { sent: 'Verification code sent.', sandbox: 'Sent to the booking email: this is the PayPal sandbox.' }
const delivered = (value: { via: 'text' | 'email'; phone: string | null; sandboxContact: boolean; shown: string | null }) => ({ ok: true as const, value })

describe('where a one-time code went', () => {
  it('says it went by text to the masked number, and offers the PayPal email instead', async () => {
    const byEmail = vi.fn()
    renderWithIntl(<><input id="code" /><CodeSent result={delivered({ via: 'text', phone: '+41 ••• •• 67', sandboxContact: false, shown: null })} pending={false} onEmailInstead={byEmail} codeInputId="code" emailWords={words} /></>)
    expect(screen.getByRole('status')).toHaveTextContent('Code sent by text to +41 ••• •• 67')
    await userEvent.click(screen.getByRole('button', { name: 'Send it to my PayPal email instead' }))
    expect(byEmail).toHaveBeenCalledOnce()
  })

  it('keeps the flow’s own words for an email, and the sandbox’s', () => {
    const { rerender } = renderWithIntl(<CodeSent result={delivered({ via: 'email', phone: null, sandboxContact: false, shown: null })} pending={false} onEmailInstead={vi.fn()} codeInputId="code" emailWords={words} />)
    expect(screen.getByRole('status')).toHaveTextContent('Verification code sent.')
    expect(screen.queryByRole('button', { name: /PayPal email instead/ })).not.toBeInTheDocument()
    rerender(<CodeSent result={delivered({ via: 'email', phone: null, sandboxContact: true, shown: null })} pending={false} onEmailInstead={vi.fn()} codeInputId="code" emailWords={words} />)
    expect(screen.getByRole('status')).toHaveTextContent('this is the PayPal sandbox')
  })

  it('offers email when a text could not go, so the renter is never stuck', () => {
    renderWithIntl(<CodeSent result={{ ok: false, failure: 'refused', reason: 'text_unavailable' }} pending={false} onEmailInstead={vi.fn()} codeInputId="code" emailWords={words} />)
    expect(screen.getByRole('alert')).toHaveTextContent('The text could not be sent.')
    expect(screen.getByRole('button', { name: 'Send it to my PayPal email instead' })).toBeInTheDocument()
  })

  it('in a demo shop, shows the text it did not send, labelled, and fills the code in from it', async () => {
    renderWithIntl(<><input id="code" aria-label="Verification code" /><CodeSent result={delivered({ via: 'text', phone: '+41 ••• •• 67', sandboxContact: false, shown: 'Ribeira Bikes: 24681357 is your code to accept or contest the claim.\n\n@hold.test #24681357' })} pending={false} onEmailInstead={vi.fn()} codeInputId="code" emailWords={words} /></>)
    const bubble = screen.getByRole('figure', { name: 'Sandbox: this text was not sent. It is what the renter would receive.' })
    expect(bubble).toHaveTextContent('24681357 is your code')
    await userEvent.click(screen.getByRole('button', { name: 'Use the code 24681357' }))
    expect(screen.getByLabelText('Verification code')).toHaveValue('24681357')
  })
})
