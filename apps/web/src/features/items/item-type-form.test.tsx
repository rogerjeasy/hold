import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ItemTypeForm } from './item-type-form'

vi.mock('./actions', () => ({ saveItemType: () => Promise.resolve(null) }))
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: () => undefined }), Link: 'a' }))

const viewLabels = () => screen.getAllByRole('textbox', { name: /^View \d+$/ }).map((input) => (input as HTMLInputElement).value)

describe('the item type form', () => {
  it('starts a new type with the views suggested for its kind', () => {
    renderWithIntl(<ItemTypeForm currency="EUR" />)
    expect(screen.getByLabelText('Kind')).toHaveValue('bike')
    expect(viewLabels()).toEqual(['Frame, left side', 'Frame, right side', 'Front wheel', 'Rear wheel', 'Saddle', 'Handlebar'])
  })

  it('follows the kind while the views are untouched', () => {
    renderWithIntl(<ItemTypeForm currency="EUR" />)
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'e_bike' } })
    expect(viewLabels()).toEqual(['Frame, left side', 'Frame, right side', 'Front wheel', 'Rear wheel', 'Display', 'Battery'])
  })

  it('keeps views the person wrote, until they ask for the suggestion', () => {
    renderWithIntl(<ItemTypeForm currency="EUR" />)
    fireEvent.change(screen.getByRole('textbox', { name: 'View 1' }), { target: { value: 'Whole bike' } })
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'camera' } })
    expect(viewLabels()[0]).toBe('Whole bike')
    fireEvent.click(screen.getByRole('button', { name: 'Use the views suggested for this kind' }))
    expect(viewLabels()).toEqual(['Front', 'Back', 'Top', 'Lens glass', 'Mount'])
  })

  it('moves, removes and adds views', () => {
    renderWithIntl(<ItemTypeForm currency="EUR" />)
    fireEvent.click(screen.getByRole('button', { name: 'Move view 1 down' }))
    expect(viewLabels().slice(0, 2)).toEqual(['Frame, right side', 'Frame, left side'])
    fireEvent.click(screen.getByRole('button', { name: 'Remove view 6' }))
    expect(viewLabels()).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Add a view' }))
    expect(viewLabels()).toHaveLength(6)
    expect(viewLabels()[5]).toBe('')
  })

  it('sends whether each view is required, one value per row', () => {
    const { container } = renderWithIntl(<ItemTypeForm currency="EUR" />)
    const required = () => [...container.querySelectorAll<HTMLInputElement>('input[name="viewRequired"]')].map((input) => input.value)
    expect(required()).toEqual(['yes', 'yes', 'yes', 'yes', 'no', 'no'])
    expect(screen.getByRole('switch', { name: 'View 5 is required' })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('switch', { name: 'View 5 is required' }))
    expect(required()[4]).toBe('yes')
  })

  it('edits an existing type with its own values, and says a new plan starts if the views change', () => {
    renderWithIntl(
      <ItemTypeForm
        currency="EUR"
        values={{
          itemTypeId: '00000000-0000-4000-8000-0000000000e1',
          name: 'City e-bike',
          category: 'e_bike',
          value: '2400.00',
          hold: '300.00',
          dayRate: '45.00',
          accessories: [{ name: 'Charger', count: '1' }],
          views: [{ label: 'Display', outline: 'detail', required: true }],
        }}
      />,
    )
    expect(screen.getByLabelText('Name')).toHaveValue('City e-bike')
    expect(screen.getByLabelText('Hold while it is out, in EUR')).toHaveValue('300.00')
    expect(screen.getByRole('textbox', { name: 'Kit item 1' })).toHaveValue('Charger')
    expect(viewLabels()).toEqual(['Display'])
    expect(screen.getByText(/Changing the views starts a new photo plan/)).toBeInTheDocument()
  })

  it('adds and removes kit items', () => {
    renderWithIntl(<ItemTypeForm currency="EUR" />)
    expect(screen.queryByRole('textbox', { name: 'Kit item 1' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add to the kit' }))
    expect(screen.getByRole('textbox', { name: 'Kit item 1' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove kit item 1' }))
    expect(screen.queryByRole('textbox', { name: 'Kit item 1' })).not.toBeInTheDocument()
  })
})
