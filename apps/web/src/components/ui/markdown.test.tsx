import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown } from './markdown'

// What a model writes is shown as the structure it means, never as its marks, and never as anything the text could
// make the page do.
describe('a model\'s Markdown', () => {
  it('shows emphasis, lists and headings as structure, with none of the marks left over', () => {
    const { container } = render(<Markdown text={'Here is **Ribeira Bikes**, and *a note*.\n\n## Prices\n\n- City bike\n- E-bike\n\n1. Pick up\n2. Return'} />)
    expect(screen.getByText('Ribeira Bikes').tagName).toBe('STRONG')
    expect(screen.getByText('a note').tagName).toBe('EM')
    expect(screen.getAllByRole('list')).toHaveLength(2)
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['City bike', 'E-bike', 'Pick up', 'Return'])
    // A heading inside a reply sits below the page's own headings.
    expect(screen.getByRole('heading', { name: 'Prices' }).tagName).toBe('H3')
    expect(container.textContent).not.toMatch(/\*\*|##|^- /m)
  })

  it('shows a table as a table, with its column headers, in a container that scrolls on its own', () => {
    render(<Markdown text={'| Item | Price |\n|------|-------|\n| Lost lock | €45.00 |\n| Cleaning | €15.00 |'} />)
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Item', 'Price'])
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(table.parentElement?.className).toContain('overflow-x-auto')
  })

  it('shows code as code, a block in its own scrolling box', () => {
    const { container } = render(<Markdown text={'Use `get_booking`.\n\n```\nclaude mcp add --transport http hold https://hold.example/mcp\n```'} />)
    expect(screen.getByText('get_booking').tagName).toBe('CODE')
    expect(container.querySelector('pre')?.className).toContain('overflow-x-auto')
  })

  it('opens a web link in a new tab without handing it this page, and drops any other kind of link', () => {
    render(<Markdown text={'[PayPal](https://www.sandbox.paypal.com/checkoutnow?token=1) and [this](javascript:alert(1))'} />)
    const link = screen.getByRole('link', { name: /PayPal/ })
    expect(link.getAttribute('href')).toBe('https://www.sandbox.paypal.com/checkoutnow?token=1')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByText('this')).toBeInTheDocument()
  })

  it('never renders HTML a model wrote, nor loads an image it names', () => {
    const { container } = render(<Markdown text={'<script>alert(1)</script><b>bold</b>\n\n![tracker](https://example.com/pixel.png)'} />)
    expect(container.querySelector('script, b, img')).toBeNull()
    expect(container.textContent).toContain('tracker')
  })
})
