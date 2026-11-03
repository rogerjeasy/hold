export const routes = {
  home: '/',
  howItWorks: '/how-it-works',
  // The two advocates of a contested claim, with a recorded live run anyone can read (extensions.md section 9).
  advocates: '/advocates',
  forShops: '/for-shops',
  forRenters: '/for-renters',
  ai: '/ai',
  paypal: '/paypal',
  reliability: '/reliability',
  demo: '/demo',
  signIn: '/sign-in',
  signUp: '/sign-up',
  // Anyone shown a renter's Clean Record checks it here (extensions.md section 7.7).
  verify: '/verify',
  // A demonstration: an assistant that rents through Hold's MCP server (extensions.md section 8.10).
  assistant: '/assistant',
  // What Hold records, why, for how long, who handles it, and how to have it erased (architecture.md section 15.2).
  privacy: '/privacy',
  terms: '/terms',
} as const

export type RouteKey = keyof typeof routes
export type RoutePath = (typeof routes)[RouteKey]

// Pages for a signed-in owner or staff member. Kept apart from the public pages above, which every public-page
// check walks without signing in.
export const shopRoutes = {
  home: '/shop',
  // Everything that waits on a person, on one board, in the order it falls due (extensions.md section 12.5).
  decisions: '/shop/decisions',
  // The operations agent's morning queue: what waits for an owner's or a manager's decision (extensions.md section 6).
  queue: '/shop/queue',
  rentals: '/shop/rentals',
  // Every line of the money log, checked against its hold, its claim and PayPal, on AG Grid (extensions.md section 12.5).
  money: '/shop/money',
  // The owner's dashboard on AG Studio, with the insights agent (extensions.md section 12.5).
  insights: '/shop/insights',
  // Every item as a row and every rental as a bar, on Bryntum Scheduler (extensions.md section 12.5).
  calendar: '/shop/calendar',
  items: '/shop/items',
  // What renters reported during their rentals (extensions.md section 10).
  incidents: '/shop/incidents',
  security: '/shop/security',
  staff: '/shop/staff',
  prices: '/shop/prices',
  paypal: '/shop/paypal',
  scorecard: '/shop/scorecard',
  trust: '/shop/trust',
  // The limits within which the shop's advocate may settle a contested claim (extensions.md section 9.4).
  settlement: '/shop/settlement',
  // What renters may do from their phone with nobody to ask: return items after hours, and keep them longer.
  selfService: '/shop/self-service',
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
  // Photographing and closing one repair (architecture.md section 9.6).
  repair: (itemId: string, repairId: string) => `/shop/items/${itemId}/repairs/${repairId}`,
  type: (itemTypeId: string) => `/shop/items/types/${itemTypeId}`,
} as const

// Pages reached by a link from an email, named by a token in their path. Not in the public list either.
export const linkRoutes = {
  invite: '/invite',
  // A renter's own rental, named by a signed token: /r/{token}. The same path as RENTER_LINK_PATH in @hold/auth, kept
  // here too because screens import this file and must not load the server's crypto.
  renter: '/r',
  record: (token: string) => `/r/${token}/record`,
  claim: (token: string) => `/r/${token}/claim`,
  // "Something happened": a renter's reports during the rental, and one report by its ID.
  incidents: (token: string) => `/r/${token}/incident`,
  incident: (token: string, incidentId: string) => `/r/${token}/incident/${incidentId}`,
  // Returning the item with nobody at the counter, and the receipt once sent.
  selfReturn: (token: string) => `/r/${token}/return`,
  // More days, priced by Hold and paid in PayPal, and where PayPal returns the renter after approving them.
  extend: (token: string) => `/r/${token}/extend`,
  // The renter's Clean Record, its credential and their consent.
  cleanRecord: (token: string) => `/r/${token}/trust`,
  // What the renter's own assistant did on the rental, and disconnecting it.
  assistant: (token: string) => `/r/${token}/assistant`,
  // The renter's advocate: the transcript, their own limit, confirming an agreement and stopping the advocate.
  negotiation: (token: string) => `/r/${token}/negotiation`,
  // A shop's own page for renters, named by its address: /s/{slug}.
  shopPage: '/s',
} as const

// Where the public key that signs Clean Record credentials is published, as a JSON Web Key Set, so anyone can check a
// credential without asking Hold.
export const CREDENTIAL_KEYS_PATH = '/.well-known/jwks.json'
