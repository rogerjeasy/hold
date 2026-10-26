import { routes, type RouteKey, type RoutePath } from '@/lib/routes'

export type NavItem = {
  key: Exclude<RouteKey, 'home' | 'demo' | 'signIn' | 'signUp' | 'verify'>
  href: RoutePath
}

export const navItems: readonly NavItem[] = [
  { key: 'howItWorks', href: routes.howItWorks },
  { key: 'forShops', href: routes.forShops },
  { key: 'forRenters', href: routes.forRenters },
  { key: 'ai', href: routes.ai },
  { key: 'paypal', href: routes.paypal },
]
