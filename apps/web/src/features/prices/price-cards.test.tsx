import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { PriceCards } from './price-cards'

const long = 'Front wheel rim bent beyond true, with the spokes on the drive side loosened and two of them snapped at the hub flange'

// The draft on a phone (F-H3): a long description once sat inside its remove button and pushed the page sideways.
describe('the price cards', () => {
  it('names the price in the remove button without printing its description inside it', async () => {
    const onRemove = vi.fn()
    renderWithIntl(<PriceCards rows={[{ key: 7, description: long, category: 'damage', amount: '45' }]} currency="EUR" problems={new Map()} onChange={vi.fn()} onRemove={onRemove} />)
    const remove = screen.getByRole('button', { name: `Remove ${long}` })
    expect(remove).not.toHaveTextContent(long)
    await userEvent.setup().click(remove)
    expect(onRemove).toHaveBeenCalledWith(7)
  })

  it('names an unnamed price by its number', () => {
    renderWithIntl(<PriceCards rows={[{ key: 1, description: '', category: 'damage', amount: '' }]} currency="EUR" problems={new Map()} onChange={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Remove price 1' })).toBeInTheDocument()
  })
})
