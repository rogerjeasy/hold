import { describe, expect, it } from 'vitest'
import { routes } from '@/lib/routes'
import { navItems } from './nav-items'

describe('navItems', () => {
  it('lists the six header pages in reading order, the advocates straight after how it works', () => {
    expect(navItems.map((item) => item.href)).toEqual([
      routes.howItWorks,
      routes.advocates,
      routes.forShops,
      routes.forRenters,
      routes.ai,
      routes.paypal,
    ])
  })

  it('never points at the home page', () => {
    expect(navItems.map((item) => item.href)).not.toContain(routes.home)
  })
})
