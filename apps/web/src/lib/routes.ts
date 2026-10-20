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
  rentals: '/shop/rentals',
  items: '/shop/items',
  security: '/shop/security',
  staff: '/shop/staff',
  prices: '/shop/prices',
  paypal: '/shop/paypal',
} as const

// Pages reached from the rentals page rather than from the menu.
export const rentalRoutes = {
  new: '/shop/rentals/new',
  claim: (rentalId: string) => `/shop/rentals/${rentalId}/claim`,
  record: (rentalId: string) => `/shop/rentals/${rentalId}/record`,
  rental: (rentalId: string) => `/shop/rentals/${rentalId}`,
  // One item's guided handover photographs.
  handover: (rentalId: string, sessionId: string) => `/shop/rentals/${rentalId}/handover/${sessionId}`,
  return: (rentalId: string, sessionId: string) => `/shop/rentals/${rentalId}/return/${sessionId}`,
  comparison: (rentalId: string, comparisonId: string) => `/shop/rentals/${rentalId}/comparison/${comparisonId}`,
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
  // A renter's own rental, named by a signed token: /r/{token}. The same path as RENTER_LINK_PATH in @hold/auth, kept
  // here too because screens import this file and must not load the server's crypto.
  renter: '/r',
  record: (token: string) => `/r/${token}/record`,
  // A shop's own page for renters, named by its address: /s/{slug}.
  shopPage: '/s',
} as const
