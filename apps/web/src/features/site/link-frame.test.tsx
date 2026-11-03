import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { LinkFrame } from './link-frame'
import { ThemeProvider } from './theme-provider'

describe('the frame of a renter’s pages', () => {
  it('links to the privacy notice and the terms of use, without passing on the link it was opened from', () => {
    renderWithIntl(
      <ThemeProvider>
        <LinkFrame>
          <p>The rental</p>
        </LinkFrame>
      </ThemeProvider>,
    )
    const legal = within(screen.getByRole('navigation', { name: 'Privacy and terms' }))
    for (const [name, href] of [['Privacy notice', '/privacy'], ['Terms of use', '/terms']] as const) {
      const link = legal.getByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveAttribute('referrerpolicy', 'no-referrer')
    }
  })
})
