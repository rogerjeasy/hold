import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { BeforeAfterTable } from './before-after-table'

describe('BeforeAfterTable', () => {
  it('sets each person before Hold beside the same person with it', () => {
    renderWithIntl(<BeforeAfterTable />)
    const table = within(screen.getByRole('table', { name: 'What changes for each person in the shop' }))
    expect(table.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Who', 'Before Hold', 'With Hold'])
    expect(table.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(['The owner', 'The counter staff', 'The business'])
  })

  it('offers the same content as a list of cards for narrow screens', () => {
    renderWithIntl(<BeforeAfterTable />)
    const cards = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(cards).toHaveLength(3)
    const first = within(cards[0] as HTMLElement)
    expect(first.getByRole('heading', { level: 3, name: 'The owner' })).toBeInTheDocument()
    expect(first.getByText('Before Hold')).toBeInTheDocument()
    expect(first.getByText('With Hold')).toBeInTheDocument()
  })
})
