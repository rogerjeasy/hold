import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { catalog, ebikeType, items } from './fixtures'
import { ItemsScreen } from './items-screen'
import type { ItemsScreenProps } from './items-screen'

const clock = { timeZone: 'Europe/Lisbon', currency: 'EUR' }

function show(props: Partial<ItemsScreenProps> = {}) {
  return renderWithIntl(<ItemsScreen shopName="Ribeira Bikes" clock={clock} catalog={catalog} show="all" canManage {...props} />)
}

describe('the items page', () => {
  it('asks for the price list first, which sets the currency', () => {
    show({ catalog: { types: [], items: [] }, clock: { ...clock, currency: null } })
    expect(screen.getByText('Publish your price list first')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to prices' })).toHaveAttribute('href', '/shop/prices')
    expect(screen.queryByRole('link', { name: 'New item type' })).not.toBeInTheDocument()
  })

  it('starts an empty shop at its first item type', () => {
    show({ catalog: { types: [], items: [] } })
    expect(screen.getByText('No items yet')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'New item type' })[0]).toHaveAttribute('href', '/shop/items/new')
  })

  it('counts the items in each standing, leaving retired items out', () => {
    show()
    const figures = screen.getByRole('region', { name: 'Your items at a glance' })
    expect(within(figures).getByText('Items').nextElementSibling).toHaveTextContent('5')
    expect(within(figures).getByText('Available').nextElementSibling).toHaveTextContent('2')
    expect(within(figures).getByText('Out now').nextElementSibling).toHaveTextContent('2')
    expect(within(figures).getByText('1 overdue')).toBeInTheDocument()
    expect(within(figures).getByText('In repair').nextElementSibling).toHaveTextContent('1')
  })

  it('shows each type with its hold, day rate, value, photo plan and kit', () => {
    show()
    const type = screen.getByRole('region', { name: 'City e-bike' })
    expect(within(type).getByText('€300.00')).toBeInTheDocument()
    expect(within(type).getByText('€45.00')).toBeInTheDocument()
    expect(within(type).getByText('€2,400.00')).toBeInTheDocument()
    expect(within(type).getByText('2 views')).toBeInTheDocument()
    expect(within(type).getByText('1 × Charger, 2 × Lock')).toBeInTheDocument()
    expect(within(type).getByRole('link', { name: 'Edit City e-bike' })).toHaveAttribute('href', `/shop/items/types/${ebikeType.id}`)
  })

  it('says where each item is, in words, with a link to its passport', () => {
    show()
    const type = screen.getByRole('region', { name: 'City e-bike' })
    const out = within(type).getByRole('listitem', { name: 'City e-bike 2' })
    expect(within(out).getByText('Out')).toBeInTheDocument()
    expect(within(out).getByText(/^Due back/)).toBeInTheDocument()
    expect(within(type).getByRole('listitem', { name: 'City e-bike 3' })).toHaveTextContent('Overdue')
    expect(within(type).getByRole('listitem', { name: 'City e-bike 4' })).toHaveTextContent('In repair')
    expect(within(type).getByRole('link', { name: 'City e-bike 1' })).toHaveAttribute('href', `/shop/items/${items.available.id}`)
    expect(within(type).getByRole('listitem', { name: 'City e-bike 1' })).toHaveTextContent('WTU-0042')
  })

  it('hides retired items until asked for them', () => {
    const { unmount } = show()
    expect(screen.queryByRole('listitem', { name: 'City e-bike 5' })).not.toBeInTheDocument()
    unmount()
    show({ show: 'retired' })
    expect(screen.getByRole('listitem', { name: 'City e-bike 5' })).toBeInTheDocument()
    expect(screen.queryByRole('listitem', { name: 'City e-bike 1' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retired' })).toHaveAttribute('aria-current', 'page')
  })

  it('marks a sample type as a sample, and offers no changes to it', () => {
    show()
    const sample = screen.getByRole('region', { name: 'Tandem kayak' })
    expect(within(sample).getAllByText('Sample').length).toBeGreaterThan(0)
    expect(within(sample).queryByRole('link', { name: /^Edit/ })).not.toBeInTheDocument()
    expect(within(sample).queryByText('Add items')).not.toBeInTheDocument()
  })

  it('offers no changes to someone who may not make them', () => {
    show({ canManage: false })
    expect(screen.queryByRole('link', { name: 'New item type' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit City e-bike' })).not.toBeInTheDocument()
    expect(screen.queryByText('Add items')).not.toBeInTheDocument()
    expect(screen.getByText('Only the owner or a manager can add item types and items.')).toBeInTheDocument()
  })
})
