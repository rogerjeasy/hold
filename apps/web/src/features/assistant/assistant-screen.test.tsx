import { TOOL_NAMES } from '@hold/mcp'
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import en from '../../../messages/en.json'
import { renderWithIntl } from '@/test/render'
import { AssistantNotice } from './assistant-notice'
import { AssistantScreen } from './assistant-screen'
import type { AssistantView } from './assistant-screen'

vi.mock('./renter-actions', () => ({ disconnectAssistant: () => Promise.resolve(null) }))

const view: AssistantView = {
  shopName: 'Ribeira Bikes',
  timeZone: 'Europe/Lisbon',
  currency: 'EUR',
  clientLabel: 'Trip planner',
  connected: true,
  revokedAt: null,
  draftReply: { decision: 'contest', comment: 'The scratch was there at pickup.' },
  actions: [
    { tool: 'create_booking', outcome: 'ok', at: new Date('2026-10-30T09:00:00Z') },
    { tool: 'get_hold', outcome: 'ok', at: new Date('2026-10-30T09:05:00Z') },
    { tool: 'submit_claim_reply', outcome: 'human_confirmation_required', at: new Date('2026-10-30T09:06:00Z') },
    { tool: 'get_claim', outcome: 'refused', at: new Date('2026-10-30T09:07:00Z') },
  ],
}

describe('what the renter sees of their assistant', () => {
  it('names the assistant as it named itself, and says the name is not verified', () => {
    renderWithIntl(<AssistantScreen token="signed-token" view={view} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('An assistant is connected to this rental')
    expect(screen.getByText('Trip planner')).toBeInTheDocument()
    expect(screen.getByText(/not verified/)).toBeInTheDocument()
  })

  it('lists every action it took, in plain words and in order, with what came of it (X3.8)', () => {
    renderWithIntl(<AssistantScreen token="signed-token" view={view} />)
    const items = within(screen.getByRole('list', { name: 'What it did' })).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Made this booking'),
      expect.stringContaining('Read the hold'),
      expect.stringContaining('Asked to answer the claim'),
      expect.stringContaining('Read the claim'),
    ])
    expect(items[2]).toHaveTextContent('Waited for you')
    expect(items[3]).toHaveTextContent('Refused')
  })

  it('shows the reply it drafted as the assistant’s words, which decide nothing', () => {
    renderWithIntl(<AssistantScreen token="signed-token" view={view} />)
    expect(screen.getByRole('blockquote')).toHaveTextContent('The scratch was there at pickup.')
    expect(screen.getByText(/Contest the claim/)).toBeInTheDocument()
  })

  it('offers to disconnect it while it is connected, and says when it was disconnected', () => {
    const { unmount } = renderWithIntl(<AssistantScreen token="signed-token" view={view} />)
    expect(screen.getByRole('button', { name: 'Disconnect the assistant' })).toBeInTheDocument()
    unmount()
    renderWithIntl(<AssistantScreen token="signed-token" view={{ ...view, connected: false, revokedAt: new Date('2026-10-30T10:00:00Z') }} />)
    expect(screen.queryByRole('button', { name: 'Disconnect the assistant' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The assistant was disconnected')
  })

  it('has plain words for every tool the server offers', () => {
    const tools = (en.renter.assistant.tools as Record<string, string>)
    expect(TOOL_NAMES.filter((name) => tools[name] === undefined)).toEqual([])
  })
})

describe('the notice on the rental page', () => {
  it('says an assistant is connected and links to what it did', () => {
    renderWithIntl(<AssistantNotice token="signed-token" assistant={{ connected: true, revoked: false }} />)
    expect(screen.getByText('An assistant is connected to this rental')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See what it did, or disconnect it' })).toHaveAttribute('href', '/r/signed-token/assistant')
  })

  it('says when the renter has disconnected it', () => {
    const { unmount } = renderWithIntl(<AssistantNotice token="t" assistant={{ connected: false, revoked: true }} />)
    expect(screen.getByText('The assistant was disconnected')).toBeInTheDocument()
    unmount()
    renderWithIntl(<AssistantNotice token="t" assistant={{ connected: false, revoked: false }} />)
    expect(screen.getByText('An assistant made this booking')).toBeInTheDocument()
  })
})
