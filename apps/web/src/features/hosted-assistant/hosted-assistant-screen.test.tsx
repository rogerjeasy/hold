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
    await waitFor(() => {
      expect(screen.getByText('Booked. Approve the fee of €120.00 in PayPal.')).toBeInTheDocument()
    })
    expect(asked.mock.calls[0]?.[1].get('conversation')).toBe('[]')
    expect(screen.getByText(/Used create_booking/)).toBeInTheDocument()
    expect(screen.getByText(/Simulated/)).toBeInTheDocument()
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
})
