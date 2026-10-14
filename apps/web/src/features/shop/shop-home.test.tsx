import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { NoShop, ShopHome } from './shop-home'

const owner = {
  userId: 'user-1',
  email: 'tomas@ribeirabikes.example',
  name: 'Tomás',
  shops: [
    { shopId: 'shop-1', name: 'Ribeira Bikes', role: 'owner' as const },
    { shopId: 'shop-2', name: 'Ribeira Kayaks', role: 'owner' as const },
  ],
}
const nothingDone = { passkey: false, paypal: false, prices: false, staff: 1 }

describe('ShopHome', () => {
  it('names the shop and who is signed in, and offers the other shops', () => {
    renderWithIntl(<ShopHome person={owner} shopId="shop-1" shopName="Ribeira Bikes" setup={nothingDone} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ribeira Bikes')
    expect(screen.getByText('Signed in as tomas@ribeirabikes.example.')).toBeInTheDocument()
    expect(screen.getByText('Ribeira Kayaks')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Work in this shop' })).toBeInTheDocument()
  })

  it('lists what is left to set up, each with the way to it', () => {
    renderWithIntl(<ShopHome person={owner} shopId="shop-1" shopName="Ribeira Bikes" setup={{ ...nothingDone, passkey: true }} />)
    const steps = screen.getByRole('region', { name: 'Set up your shop' })
    expect(steps).toHaveTextContent('Add a passkey')
    expect(screen.getAllByText('Done.')).toHaveLength(1)
    expect(screen.getAllByText('To do.')).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Go to PayPal' })).toHaveAttribute('href', '/shop/paypal')
  })

  it('names the current page in the shop’s menu', () => {
    renderWithIntl(<ShopHome person={owner} shopId="shop-1" shopName="Ribeira Bikes" setup={nothingDone} />)
    expect(screen.getByRole('navigation', { name: 'Shop pages' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
  })

  it('offers a way to sign out', () => {
    renderWithIntl(<ShopHome person={owner} shopId="shop-1" shopName="Ribeira Bikes" setup={nothingDone} />)
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
})

describe('NoShop', () => {
  it('tells a person with no shop how to get one', () => {
    renderWithIntl(<NoShop person={undefined} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('No shop yet.')
    expect(screen.getByText(/Create one on the sign-up page/)).toBeInTheDocument()
  })
})
