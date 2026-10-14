import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { MobileMenu } from './mobile-menu'

async function openMenu() {
  renderWithIntl(<MobileMenu />)
  await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
  return within(screen.getByRole('dialog', { name: 'Menu' }))
}

describe('MobileMenu', () => {
  it('stays closed until asked', () => {
    renderWithIntl(<MobileMenu />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lists every header page, the demo and sign-in', async () => {
    const menu = await openMenu()
    expect(menu.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/how-it-works',
      '/for-shops',
      '/for-renters',
      '/ai',
      '/paypal',
      '/demo',
      '/sign-in',
    ])
  })

  it('closes once a page is chosen', async () => {
    const menu = await openMenu()
    // jsdom cannot load another page, so the link's own navigation is held back. The menu's handler still runs.
    window.addEventListener('click', (event) => { event.preventDefault() }, { capture: true, once: true })
    await userEvent.click(menu.getByRole('link', { name: 'For renters' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('can be closed without choosing', async () => {
    const menu = await openMenu()
    await userEvent.click(menu.getByRole('button', { name: 'Close menu' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
