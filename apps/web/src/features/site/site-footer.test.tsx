import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { SiteFooter } from './site-footer'

describe('SiteFooter', () => {
  it('links to every header page, and to the published scorecard', () => {
    renderWithIntl(<SiteFooter year={2026} />)
    const footer = within(screen.getByRole('contentinfo'))
    expect(
      footer
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'))
        .sort(),
    ).toEqual(['/ai', '/for-renters', '/for-shops', '/how-it-works', '/paypal', '/reliability'])
  })

  it('says plainly that Hold is not an insurer', () => {
    renderWithIntl(<SiteFooter year={2026} />)
    expect(screen.getByText(/Hold is not an insurer/)).toBeInTheDocument()
  })

  it('credits the photographs and says the marks are illustrative', () => {
    renderWithIntl(<SiteFooter year={2026} />)
    expect(screen.getByText(/The marks on the frame are illustrative/)).toBeInTheDocument()
  })

  it('shows the year it is given', () => {
    renderWithIntl(<SiteFooter year={2031} />)
    expect(screen.getByText('© 2031 Hold')).toBeInTheDocument()
  })
})
