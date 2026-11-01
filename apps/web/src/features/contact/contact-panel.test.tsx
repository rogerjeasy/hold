import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ContactPanel } from './contact-panel'

const actions = vi.hoisted(() => ({ sendPhoneCode: vi.fn(), confirmPhone: vi.fn(), chooseEmail: vi.fn(), sendContactChangeCode: vi.fn() }))
vi.mock('./renter-actions', () => actions)
vi.mock('@/i18n/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ refresh: vi.fn() }) }))

const emailOnly = { channel: 'email' as const, phone: null, confirmed: false, locked: false, shown: [] }

beforeEach(() => { vi.clearAllMocks() })

describe('how the renter is reached', () => {
  it('lets a renter on email choose texts, send a code to their number and confirm it', async () => {
    actions.sendPhoneCode.mockResolvedValue({ ok: true, value: { phone: '+41 ••• •• 67', confirmed: false, shown: null } })
    actions.confirmPhone.mockResolvedValue({ ok: true, value: { phone: '+41 ••• •• 67' } })
    renderWithIntl(<ContactPanel token="token" contact={emailOnly} />)
    const panel = screen.getByRole('region', { name: 'How we reach you' })
    expect(panel).toHaveTextContent('By email')
    await userEvent.click(within(panel).getByRole('button', { name: 'Text me instead' }))
    const phone = within(panel).getByLabelText('Your mobile number, with its country code')
    expect(phone).toHaveAttribute('type', 'tel')
    expect(phone).toHaveAttribute('autocomplete', 'tel')
    await userEvent.type(phone, '+41791234567')
    await userEvent.click(within(panel).getByRole('button', { name: 'Text me a code' }))
    const code = await within(panel).findByLabelText('The code we texted to +41 ••• •• 67')
    expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    await userEvent.type(code, '24681357')
    await userEvent.click(within(panel).getByRole('button', { name: 'Confirm this phone' }))
    expect(await within(panel).findByRole('status')).toHaveTextContent('Texts about this rental now go to +41 ••• •• 67.')
  })

  it('shows a confirmed phone, and lets the renter go back to email', async () => {
    actions.chooseEmail.mockResolvedValue({ ok: true, value: { channel: 'email' } })
    renderWithIntl(<ContactPanel token="token" contact={{ channel: 'text', phone: '+41 ••• •• 67', confirmed: true, locked: true, shown: [] }} />)
    const panel = screen.getByRole('region', { name: 'How we reach you' })
    expect(panel).toHaveTextContent('By text to +41 ••• •• 67')
    expect(panel).toHaveTextContent('Confirmed')
    await userEvent.click(within(panel).getByRole('button', { name: 'Use email instead' }))
    expect(actions.chooseEmail).toHaveBeenCalledOnce()
  })

  it('once the hold is placed, asks for a code from the channel trusted now before a new number', async () => {
    actions.sendContactChangeCode.mockResolvedValue({ ok: true, value: { via: 'text', phone: '+41 ••• •• 67', sandboxContact: false, shown: null } })
    renderWithIntl(<ContactPanel token="token" contact={{ channel: 'text', phone: '+41 ••• •• 67', confirmed: true, locked: true, shown: [] }} />)
    const panel = screen.getByRole('region', { name: 'How we reach you' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Change the number' }))
    expect(panel).toHaveTextContent('To move your texts to a new phone, we first send a code where your codes go now.')
    await userEvent.click(within(panel).getByRole('button', { name: 'Send me that code' }))
    expect(await within(panel).findByLabelText('The code we just sent')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Your new mobile number, with its country code')).toBeInTheDocument()
  })

  it('in a demo shop, shows the texts it did not send, labelled', () => {
    renderWithIntl(<ContactPanel token="token" contact={{ channel: 'text', phone: '+41 ••• •• 67', confirmed: false, locked: false, shown: [{ id: 't1', body: 'Ribeira Bikes: your rental. https://hold.test/r/T' }] }} />)
    expect(screen.getByRole('figure', { name: 'Sandbox: this text was not sent. It is what the renter would receive.' })).toHaveTextContent('Ribeira Bikes: your rental.')
  })
})
