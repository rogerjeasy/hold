export const routes = {
  home: '/',
  howItWorks: '/how-it-works',
  forShops: '/for-shops',
  forRenters: '/for-renters',
  ai: '/ai',
  paypal: '/paypal',
  demo: '/demo',
  signIn: '/sign-in',
  signUp: '/sign-up',
} as const

export type RouteKey = keyof typeof routes
export type RoutePath = (typeof routes)[RouteKey]

// Pages for a signed-in owner or staff member. Kept apart from the public pages above, which every public-page
// check walks without signing in.
export const shopRoutes = {
  home: '/shop',
  items: '/shop/items',
  security: '/shop/security',
  staff: '/shop/staff',
  prices: '/shop/prices',
  paypal: '/shop/paypal',
} as const

// Pages reached from the items page rather than from the menu, some named by the row they show.
export const itemRoutes = {
  newType: '/shop/items/new',
  item: (itemId: string) => `/shop/items/${itemId}`,
  type: (itemTypeId: string) => `/shop/items/types/${itemTypeId}`,
} as const

// Pages reached by a link from an email, named by a token in their path. Not in the public list either.
export const linkRoutes = {
  invite: '/invite',
} as const
