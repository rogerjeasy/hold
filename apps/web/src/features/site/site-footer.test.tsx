import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { SiteFooter } from './site-footer'

describe('SiteFooter', () => {
  it('links to every header page, the published scorecard, the privacy notice and the terms', () => {
    renderWithIntl(<SiteFooter year={2026} />)
    const footer = within(screen.getByRole('contentinfo'))
    expect(
      footer
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'))
        .sort(),
    ).toEqual(['/advocates', '/ai', '/for-renters', '/for-shops', '/how-it-works', '/paypal', '/privacy', '/reliability', '/terms'])
  })

  it('keeps the advocates with the product pages, and the two audiences apart', () => {
    renderWithIntl(<SiteFooter year={2026} />)
    const group = (name: string) => within(screen.getByRole('heading', { level: 2, name }).parentElement ?? document.body).getAllByRole('link').map((link) => link.getAttribute('href'))
    expect(group('Product')).toEqual(['/how-it-works', '/advocates', '/ai', '/paypal', '/reliability'])
    expect(group('For you')).toEqual(['/for-shops', '/for-renters'])
  })

  it('links to the privacy notice and the terms of use', () => {
    renderWithIntl(<SiteFooter year={2026} />)
    const legal = within(screen.getByRole('navigation', { name: 'Privacy and terms' }))
    expect(legal.getByRole('link', { name: 'Privacy notice' })).toHaveAttribute('href', '/privacy')
    expect(legal.getByRole('link', { name: 'Terms of use' })).toHaveAttribute('href', '/terms')
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
