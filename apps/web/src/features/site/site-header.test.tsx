import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { navigation } from '@/test/navigation'
import { renderWithIntl } from '@/test/render'
import { SiteHeader } from './site-header'

function mainNav() {
  return within(screen.getByRole('navigation', { name: 'Main' }))
}

describe('SiteHeader', () => {
  it('links the logo to the home page', () => {
    renderWithIntl(<SiteHeader />)
    expect(screen.getByRole('link', { name: 'Hold, home page' })).toHaveAttribute('href', '/')
  })

  it.each([
    ['How it works', '/how-it-works'],
    ['For shops', '/for-shops'],
    ['For renters', '/for-renters'],
    ['The AI', '/ai'],
    ['PayPal', '/paypal'],
  ])('links "%s" to its own page', (name, href) => {
    renderWithIntl(<SiteHeader />)
    expect(mainNav().getByRole('link', { name })).toHaveAttribute('href', href)
  })

  it('has no link that only jumps within the page', () => {
    renderWithIntl(<SiteHeader />)
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href') ?? '')
    expect(hrefs.filter((href) => href.includes('#'))).toEqual([])
  })

  it('offers the demo shop as the main action', () => {
    renderWithIntl(<SiteHeader />)
    expect(screen.getByRole('link', { name: 'Open the demo shop' })).toHaveAttribute('href', '/demo')
  })

  it('offers sign-in to owners and staff', () => {
    renderWithIntl(<SiteHeader />)
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
  })

  it('marks the page the reader is on', () => {
    navigation.pathname = '/for-shops'
    renderWithIntl(<SiteHeader />)
    expect(mainNav().getByRole('link', { name: 'For shops' })).toHaveAttribute('aria-current', 'page')
    expect(mainNav().getByRole('link', { name: 'For renters' })).not.toHaveAttribute('aria-current')
  })

  it('keeps the reader in their language', () => {
    navigation.pathname = '/es'
    renderWithIntl(<SiteHeader />, { locale: 'es' })
    expect(mainNav().getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/es/how-it-works')
  })
})
