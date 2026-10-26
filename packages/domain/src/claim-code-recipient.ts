// PayPal's sandbox gives its test accounts addresses on these domains, and no mail reaches them.
const SANDBOX_TEST_DOMAINS = ['personal.example.com', 'business.example.com'] as const

export type ClaimCodeRecipient = { readonly email: string; readonly sandboxContact: boolean }

// The code that lets a renter accept or contest a claim goes to the address PayPal gave for the payer, so nobody who
// only typed an address at the counter can answer for them. In the sandbox that address is a test account's, which
// receives nothing, so a booking's contact receives it instead, and the record says so. Live, it is always the payer.
export function claimCodeRecipient(input: { readonly paypalMode: 'sandbox' | 'live'; readonly payerEmail: string; readonly contactEmail: string | null }): ClaimCodeRecipient {
  const domain = input.payerEmail.slice(input.payerEmail.lastIndexOf('@') + 1).toLowerCase()
  const testAccount = SANDBOX_TEST_DOMAINS.some((each) => each === domain)
  if (input.paypalMode === 'sandbox' && testAccount && input.contactEmail !== null) return { email: input.contactEmail, sandboxContact: true }
  return { email: input.payerEmail, sandboxContact: false }
}
