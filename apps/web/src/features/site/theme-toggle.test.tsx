import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { ThemeProvider } from './theme-provider'
import { ThemeToggle } from './theme-toggle'

function renderToggle() {
  return renderWithIntl(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )
}

describe('ThemeToggle', () => {
  it('offers the dark theme when the page is light', () => {
    renderToggle()
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  })

  it('turns the page dark', async () => {
    renderToggle()
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement).toHaveClass('dark')
  })

  it('offers the way back to light', async () => {
    renderToggle()
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement).not.toHaveClass('dark')
  })
})
