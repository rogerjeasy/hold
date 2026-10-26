import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { claimCodeRecipient } from './claim-code-recipient.ts'

describe('who receives the code that lets a renter answer a claim', () => {
  it('is the address PayPal gave for the payer, in live mode', () => {
    expect(claimCodeRecipient({ paypalMode: 'live', payerEmail: 'priya@example.org', contactEmail: 'staff-typed@example.org' })).toEqual({ email: 'priya@example.org', sandboxContact: false })
  })

  it('is the booking contact in the sandbox when PayPal named a test account, which receives no mail', () => {
    expect(claimCodeRecipient({ paypalMode: 'sandbox', payerEmail: 'sb-abc123@personal.example.com', contactEmail: 'priya@gmail.com' })).toEqual({ email: 'priya@gmail.com', sandboxContact: true })
  })

  it('stays the payer in the sandbox when the payer has a real address or no contact was given', () => {
    expect(claimCodeRecipient({ paypalMode: 'sandbox', payerEmail: 'priya@example.org', contactEmail: 'other@gmail.com' })).toEqual({ email: 'priya@example.org', sandboxContact: false })
    expect(claimCodeRecipient({ paypalMode: 'sandbox', payerEmail: 'sb-abc123@personal.example.com', contactEmail: null })).toEqual({ email: 'sb-abc123@personal.example.com', sandboxContact: false })
  })

  it('never leaves the payer in live mode, whatever the addresses', () => {
    fc.assert(fc.property(fc.emailAddress(), fc.option(fc.emailAddress(), { nil: null }), (payerEmail, contactEmail) => {
      expect(claimCodeRecipient({ paypalMode: 'live', payerEmail, contactEmail }).email).toBe(payerEmail)
    }))
  })
})
