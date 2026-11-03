import type { Conversation } from '@hold/mcp'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ChatTranscript } from './chat-transcript'

const conversation: Conversation = [
  { role: 'user', content: [{ type: 'text', text: 'Is **this** bold?' }] },
  { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'get_damage_prices', input: {} }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}', is_error: false }] },
  { role: 'assistant', content: [{ type: 'text', text: 'Damage at **Ribeira Bikes**:\n\n| Item | Price |\n|---|---|\n| Lost lock | €45.00 |' }] },
]

describe('the hosted assistant’s chat', () => {
  it('shows the assistant’s reply as the structure it wrote, and the person’s words exactly as typed', () => {
    renderWithIntl(<ChatTranscript conversation={conversation} simulated={false} />)
    const chat = screen.getByRole('list', { name: 'Conversation' })
    expect(within(chat).getByText('Ribeira Bikes').tagName).toBe('STRONG')
    expect(within(chat).getByRole('table')).toBeInTheDocument()
    expect(within(chat).getByRole('cell', { name: '€45.00' })).toBeInTheDocument()
    expect(within(chat).getByText('Is **this** bold?')).toBeInTheDocument()
    expect(chat.textContent).not.toContain('|---|')
  })
})
