import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { HostedAssistantScreen } from './hosted-assistant-screen'

const answer = {
  conversation: [
    { role: 'user', content: [{ type: 'text', text: 'Book me an e-bike.' }] },
    { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'create_booking', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}', is_error: false }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Booked. Approve the fee of €120.00 in PayPal.' }] },
  ],
  reply: 'Booked. Approve the fee of €120.00 in PayPal.',
  toolCalls: [{ name: 'create_booking', ok: true }],
  approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1',
  approvalQr: '<svg></svg>',
  stopped: 'done',
  simulated: true,
  model: 'simulated-script',
  promptVersion: 'hosted-assistant-1',
}
const asked = vi.fn<(previous: unknown, data: FormData) => Promise<unknown>>(() => Promise.resolve({ ok: true, value: answer }))
vi.mock('./actions', () => ({ askAssistant: (previous: unknown, data: FormData) => asked(previous, data) }))

describe('the hosted assistant’s page', () => {
  it('says it is a demonstration, and gives the address for connecting one’s own assistant', () => {
    renderWithIntl(<HostedAssistantScreen mcpUrl="https://hold.example/mcp" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Rent through an assistant')
    expect(screen.getByText(/^This is a demonstration\./)).toBeInTheDocument()
    expect(screen.getByText('https://hold.example/mcp')).toBeInTheDocument()
  })

  it('shows the exchange, the tools it used, a simulated label, and PayPal’s link to approve the fee', async () => {
    renderWithIntl(<HostedAssistantScreen mcpUrl="https://hold.example/mcp" />)
    await userEvent.type(screen.getByLabelText('Your message'), 'Book me an e-bike.')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    // The reply comes from the conversation, set inside the action; the label and the link come from the action's
    // result, which can render one commit later. Wait for both.
    await waitFor(() => {
      expect(screen.getByText('Booked. Approve the fee of €120.00 in PayPal.')).toBeInTheDocument()
      expect(screen.getByText(/Simulated/)).toBeInTheDocument()
    })
    expect(asked.mock.calls[0]?.[1].get('conversation')).toBe('[]')
    expect(screen.getByText(/Used create_booking/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Approve the fee in PayPal' })).toHaveAttribute('href', 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1')
    expect(screen.getByRole('img', { name: /Scan to approve/ })).toBeInTheDocument()
  })

  it('says plainly when the assistant stopped at a limit or could not be reached', async () => {
    asked.mockResolvedValueOnce({ ok: true, value: { ...answer, conversation: [], reply: '', approvalUrl: null, approvalQr: null, stopped: 'unavailable', toolCalls: [] } })
    renderWithIntl(<HostedAssistantScreen mcpUrl="https://hold.example/mcp" />)
    await userEvent.type(screen.getByLabelText('Your message'), 'Hello')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText(/could not be reached/)).toBeInTheDocument()
  })

  it('says plainly when the day’s questions are spent, and that nothing was booked', async () => {
    asked.mockResolvedValueOnce({ ok: false, failure: 'daily_cap' })
    renderWithIntl(<HostedAssistantScreen mcpUrl="https://hold.example/mcp" />)
    await userEvent.type(screen.getByLabelText('Your message'), 'Hello')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('The assistant has answered all the questions it can today. Try again after midnight UTC. Nothing was booked.')).toBeInTheDocument()
  })

  it('offers to ask about the demo’s latest booking only when there is one, and sends that question with the lookup', async () => {
    asked.mockClear()
    const { unmount } = renderWithIntl(<HostedAssistantScreen mcpUrl="https://hold.example/mcp" />)
    expect(screen.queryByRole('button', { name: 'Ask about my latest booking' })).not.toBeInTheDocument()
    unmount()
    asked.mockResolvedValueOnce({ ok: true, value: { ...answer, conversation: [{ role: 'user', content: [{ type: 'text', text: 'Where does my latest booking stand?' }] }, { role: 'assistant', content: [{ type: 'text', text: 'The fee is not paid yet.' }] }], approvalUrl: null, approvalQr: null } })
    renderWithIntl(<HostedAssistantScreen mcpUrl="https://hold.example/mcp" canAskAboutBooking />)
    await userEvent.click(screen.getByRole('button', { name: 'Ask about my latest booking' }))
    expect(await screen.findByText('The fee is not paid yet.')).toBeInTheDocument()
    expect(asked.mock.calls[0]?.[1].get('lookup')).toBe('latest_booking')
    expect(asked.mock.calls[0]?.[1].get('text')).toBe('Where does my latest booking stand?')
    // Its secret was given to this conversation once; the offer is not made again.
    expect(screen.queryByRole('button', { name: 'Ask about my latest booking' })).not.toBeInTheDocument()
  })

  it('says plainly when there was no booking of theirs to look up, and that nothing was asked', async () => {
    asked.mockResolvedValueOnce({ ok: true, value: { ...answer, conversation: [], reply: '', approvalUrl: null, approvalQr: null, stopped: 'already_followed', toolCalls: [] } })
    renderWithIntl(<HostedAssistantScreen mcpUrl="https://hold.example/mcp" canAskAboutBooking />)
    await userEvent.click(screen.getByRole('button', { name: 'Ask about my latest booking' }))
    expect(await screen.findByText(/An assistant already follows your latest booking/)).toBeInTheDocument()
  })

  // An answer takes several calls to Claude and to Hold's tools; the page shows the person's words at once and how
  // long the assistant has been at it, never a silent wait.
  it('shows the message at once, and how long the assistant has been working, while the answer is on its way', async () => {
    let answered: (value: unknown) => void = () => undefined
    asked.mockImplementationOnce(() => new Promise((resolve) => { answered = resolve }))
    renderWithIntl(<HostedAssistantScreen mcpUrl="https://hold.example/mcp" />)
    await userEvent.type(screen.getByLabelText('Your message'), 'Book me an e-bike.')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Book me an e-bike.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/The assistant is working on it · \d+ s/)
    answered({ ok: true, value: answer })
    expect(await screen.findByText('Booked. Approve the fee of €120.00 in PayPal.')).toBeInTheDocument()
    // The answer can render a moment before the action stops pending, so the status is awaited, not read once.
    await waitFor(() => { expect(screen.queryByRole('status')).not.toBeInTheDocument() })
  })

  it('sends with Enter, keeps Shift+Enter for a new line, and empties the box once sent', async () => {
    asked.mockClear()
    renderWithIntl(<HostedAssistantScreen mcpUrl="https://hold.example/mcp" />)
    const box = screen.getByLabelText('Your message')
    await userEvent.type(box, 'Book me{Shift>}{Enter}{/Shift}an e-bike.')
    expect(asked).not.toHaveBeenCalled()
    await userEvent.type(box, '{Enter}')
    await waitFor(() => {
      expect(asked).toHaveBeenCalledTimes(1)
    })
    expect(asked.mock.calls[0]?.[1].get('text')).toBe('Book me\nan e-bike.')
    await waitFor(() => {
      expect(box).toHaveValue('')
    })
  })
})
