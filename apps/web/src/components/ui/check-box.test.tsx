import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CheckBox } from './check-box'

// A checkbox drawn at the size of text, whose real control fills a 44 pixel square so it is easy to tap.
describe('a checkbox', () => {
  it('is named by its label, shown or not, and reports each change', async () => {
    const changed = vi.fn()
    render(<CheckBox label="Only mine" checked={false} onChange={changed} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Only mine' }))
    expect(changed).toHaveBeenCalledWith(true)
    render(<CheckBox label="Choose the release of €300.00" hideLabel checked onChange={changed} />)
    expect(screen.getByRole('checkbox', { name: 'Choose the release of €300.00' })).toBeChecked()
  })

  it('makes the control itself the whole 44 pixel square', () => {
    render(<CheckBox label="Only mine" checked={false} onChange={() => undefined} />)
    expect(screen.getByRole('checkbox', { name: 'Only mine' })).toHaveClass('size-11')
  })
})
