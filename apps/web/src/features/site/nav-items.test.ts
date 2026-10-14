import { describe, expect, it } from 'vitest'
import { routes } from '@/lib/routes'
import { navItems } from './nav-items'

describe('navItems', () => {
  it('lists the five header pages in reading order', () => {
    expect(navItems.map((item) => item.href)).toEqual([
      routes.howItWorks,
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
