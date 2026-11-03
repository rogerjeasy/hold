import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import '@/test/navigation'
import { renderWithIntl } from '@/test/render'
import { CommandPalette } from './command-palette'

function palette(role: 'owner' | 'read_only' = 'owner') {
  return renderWithIntl(<CommandPalette role={role} />)
}

describe('the jump-to palette', () => {
  it('opens from its button and lists every page of the shop', async () => {
    palette()
    await userEvent.click(screen.getByRole('button', { name: /Jump to/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Jump to a page' })
    expect(within(dialog).getByRole('option', { name: /Today/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('option', { name: /Prices/ })).toBeInTheDocument()
  })

  it('opens with Ctrl+K from anywhere on the page', async () => {
    palette()
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('dialog', { name: 'Jump to a page' })).toBeInTheDocument()
  })

  it('narrows the list to what the person types, and says when nothing matches', async () => {
    palette()
    await userEvent.click(screen.getByRole('button', { name: /Jump to/ }))
    const search = await screen.findByRole('combobox', { name: 'Jump to a page' })
    await userEvent.type(search, 'pri')
    const dialog = screen.getByRole('dialog', { name: 'Jump to a page' })
    expect(within(dialog).getByRole('option', { name: /Prices/ })).toHaveAttribute('href', '/shop/prices')
    expect(within(dialog).queryByRole('option', { name: /Today/ })).not.toBeInTheDocument()
    await userEvent.clear(search)
    await userEvent.type(search, 'zzz')
    expect(within(dialog).getByText(/Nothing matches/)).toBeInTheDocument()
  })

  it('moves the choice with the arrow keys', async () => {
    palette()
    await userEvent.click(screen.getByRole('button', { name: /Jump to/ }))
    const search = await screen.findByRole('combobox', { name: 'Jump to a page' })
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    await userEvent.type(search, '{ArrowDown}')
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    expect(search).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]?.id)
  })

  it('offers starting a rental to staff who may, and not to read-only staff', async () => {
    palette('owner')
    await userEvent.click(screen.getByRole('button', { name: /Jump to/ }))
    expect(await screen.findByRole('option', { name: /New rental/ })).toHaveAttribute('href', '/shop/rentals/new')
  })

  it('hides starting a rental from read-only staff', async () => {
    palette('read_only')
    await userEvent.click(screen.getByRole('button', { name: /Jump to/ }))
    await screen.findByRole('dialog', { name: 'Jump to a page' })
    expect(screen.queryByRole('option', { name: /New rental/ })).not.toBeInTheDocument()
  })
})
