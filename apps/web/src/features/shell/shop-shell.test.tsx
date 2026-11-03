import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { navigation } from '@/test/navigation'
import { renderWithIntl } from '@/test/render'
import { ShopShell } from './shop-shell'

const person = {
  userId: 'user-1',
  email: 'tomas@ribeirabikes.example',
  name: 'Tomás Ribeiro',
  shops: [
    { shopId: 'shop-1', name: 'Ribeira Bikes', role: 'owner' as const },
    { shopId: 'shop-2', name: 'Ribeira Kayaks', role: 'manager' as const },
  ],
}

function shell(paypalConnected = true, role: 'owner' | 'read_only' = 'owner') {
  return renderWithIntl(
    <ShopShell person={person} shop={{ id: 'shop-1', name: 'Ribeira Bikes' }} role={role} paypalConnected={paypalConnected}>
      <p>The page</p>
    </ShopShell>,
  )
}

describe('the shop shell', () => {
  it('holds the page in the main landmark', () => {
    shell()
    expect(screen.getByRole('main')).toHaveTextContent('The page')
  })

  it('marks the current page in the shop’s menu, and groups the settings', () => {
    navigation.pathname = '/shop/prices'
    shell()
    const menu = screen.getAllByRole('navigation', { name: 'Shop pages' })[0]
    if (menu === undefined) throw new Error('No shop menu.')
    expect(within(menu).getByRole('link', { name: 'Prices' })).toHaveAttribute('aria-current', 'page')
    expect(within(menu).getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current')
    expect(within(menu).getByText('Settings')).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: 'Trust ladder' })).toHaveAttribute('href', '/shop/trust')
    expect(within(menu).getByRole('link', { name: 'Contested claims' })).toHaveAttribute('href', '/shop/settlement')
  })

  it('lists the incidents renters reported among the day’s work', () => {
    navigation.pathname = '/shop'
    shell()
    const menu = screen.getAllByRole('navigation', { name: 'Shop pages' })[0]
    if (menu === undefined) throw new Error('No shop menu.')
    expect(within(menu).getByRole('link', { name: 'Incidents' })).toHaveAttribute('href', '/shop/incidents')
  })

  it('lists the decision board right after the day, then the morning queue', () => {
    navigation.pathname = '/shop'
    shell()
    const menu = screen.getAllByRole('navigation', { name: 'Shop pages' })[0]
    if (menu === undefined) throw new Error('No shop menu.')
    const links = within(menu).getAllByRole('link').map((link) => link.textContent)
    expect(links.indexOf('Decisions')).toBe(links.indexOf('Today') + 1)
    expect(links.indexOf('Morning queue')).toBe(links.indexOf('Decisions') + 1)
    expect(within(menu).getByRole('link', { name: 'Decisions' })).toHaveAttribute('href', '/shop/decisions')
    expect(within(menu).getByRole('link', { name: 'Morning queue' })).toHaveAttribute('href', '/shop/queue')
  })

  it('lists the calendar right after the rentals', () => {
    navigation.pathname = '/shop'
    shell()
    const menu = screen.getAllByRole('navigation', { name: 'Shop pages' })[0]
    if (menu === undefined) throw new Error('No shop menu.')
    const links = within(menu).getAllByRole('link').map((link) => link.textContent)
    expect(links.indexOf('Calendar')).toBe(links.indexOf('Rentals') + 1)
    expect(within(menu).getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '/shop/calendar')
  })

  it('names the shop, the person’s role in it, and offers the person’s other shops', async () => {
    shell()
    const switcher = screen.getAllByRole('button', { name: /Switch shop, now Ribeira Bikes/ })[0]
    if (switcher === undefined) throw new Error('No shop switcher.')
    expect(switcher).toHaveTextContent('Owner')
    await userEvent.click(switcher)
    expect(await screen.findByRole('menuitem', { name: /Ribeira Kayaks/ })).toBeInTheDocument()
  })

  it('offers the website and signing out from the account menu', async () => {
    shell()
    const account = screen.getAllByRole('button', { name: 'Account of Tomás Ribeiro' })[0]
    if (account === undefined) throw new Error('No account menu.')
    await userEvent.click(account)
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Hold website' })).toHaveAttribute('href', '/')
  })

  it('says whether PayPal is connected, and in which mode', () => {
    shell(true)
    expect(screen.getAllByRole('link', { name: 'PayPal connected · sandbox' })[0]).toHaveAttribute('href', '/shop/paypal')
  })

  it('says plainly when PayPal is not connected', () => {
    shell(false)
    expect(screen.getAllByRole('link', { name: 'PayPal not connected' })[0]).toBeInTheDocument()
  })

  it('keeps the day’s work and a new rental within thumb reach on a phone or a tablet', () => {
    navigation.pathname = '/shop/rentals'
    shell()
    const tabs = screen.getByRole('navigation', { name: 'Quick links' })
    expect(within(tabs).getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/shop')
    expect(within(tabs).getByRole('link', { name: 'Decisions' })).toHaveAttribute('href', '/shop/decisions')
    expect(within(tabs).getByRole('link', { name: 'Rentals' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'New rental' })).toHaveAttribute('href', '/shop/rentals/new')
    expect(within(tabs).getByRole('button', { name: 'Open the shop menu' })).toBeInTheDocument()
  })

  it('offers read-only staff no new rental in the quick links', () => {
    shell(true, 'read_only')
    const tabs = screen.getByRole('navigation', { name: 'Quick links' })
    expect(within(tabs).queryByRole('link', { name: 'New rental' })).not.toBeInTheDocument()
  })
})
