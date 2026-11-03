import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { RENTAL_STATES } from './rental.ts'
import { callingCodeFor, contactChangeNeedsCode, EMAIL_LIMITS, emailIsEssential, maskedPhone, phoneNumber, renterCodeRecipient, SENDING_ACCOUNT, textAllowed } from './renter-contact.ts'

describe('a phone number a renter types', () => {
  it('is kept in the international form, whatever spacing and punctuation it was typed with', () => {
    expect(phoneNumber('+41 79 123 45 67')).toBe('+41791234567')
    expect(phoneNumber('+1 (415) 555-0123')).toBe('+14155550123')
    expect(phoneNumber('0041 79 123 45 67')).toBe('+41791234567')
    expect(phoneNumber('+351.912.345.678')).toBe('+351912345678')
  })

  it('is refused without a country code, too short, too long, or with letters', () => {
    for (const typed of ['079 123 45 67', '+41 79', '+1234567890123456', '+41 79 CALL ME', '+0 79 123 45 67', '', '+']) expect(phoneNumber(typed)).toBeUndefined()
  })

  it('is texted only in the countries Hold sends to', () => {
    expect(textAllowed('+41791234567')).toBe(true)
    expect(textAllowed('+351912345678')).toBe(true)
    expect(textAllowed('+14155550123')).toBe(true)
    // A premium-rate or high-fraud destination is never texted, however the number was typed.
    expect(textAllowed('+881612345678')).toBe(false)
    expect(textAllowed('+2341234567890')).toBe(false)
  })

  it('texts +1 only in the United States and Canada, never the Caribbean and territories that share it', () => {
    expect(textAllowed('+14155550123')).toBe(true)
    expect(textAllowed('+16045550123')).toBe(true)
    // Jamaica, the Dominican Republic, the Cayman Islands, Bermuda and Guam: well-known targets of texting fraud.
    for (const phone of ['+18765550123', '+18095550123', '+13455550123', '+14415550123', '+16715550123']) expect(textAllowed(phone), phone).toBe(false)
    // A North American number has exactly ten digits after the 1.
    expect(textAllowed('+141555501234')).toBe(false)
  })

  it('starts with the country code of the phone’s region, for each country Hold texts', () => {
    expect(callingCodeFor('CH')).toBe('41')
    expect(callingCodeFor('pt')).toBe('351')
    expect(callingCodeFor('US')).toBe('1')
    expect(callingCodeFor('NG')).toBeUndefined()
    expect(callingCodeFor('')).toBeUndefined()
  })

  it('shows staff and logs only its first and last digits', () => {
    expect(maskedPhone('+41791234567')).toBe('+41 ••• •• 67')
    fc.assert(fc.property(fc.stringMatching(/^\+[1-9][0-9]{7,14}$/), (phone) => {
      const masked = maskedPhone(phone)
      expect(masked.endsWith(phone.slice(-2))).toBe(true)
      expect(masked).not.toContain(phone.slice(3, -2))
    }))
  })
})

describe('where a renter’s one-time code goes', () => {
  const live = { paypalMode: 'live', payerEmail: 'priya@example.org', contactEmail: null } as const

  it('is the confirmed phone when the renter chose texts', () => {
    expect(renterCodeRecipient({ ...live, channel: 'text', phone: '+41791234567', phoneConfirmed: true, via: 'chosen' })).toEqual({ channel: 'text', phone: '+41791234567' })
  })

  it('is the PayPal email when the renter asks for it there, chose email, or the phone is not confirmed', () => {
    const email = { channel: 'email', email: 'priya@example.org', sandboxContact: false }
    expect(renterCodeRecipient({ ...live, channel: 'text', phone: '+41791234567', phoneConfirmed: true, via: 'email' })).toEqual(email)
    expect(renterCodeRecipient({ ...live, channel: 'email', phone: '+41791234567', phoneConfirmed: true, via: 'chosen' })).toEqual(email)
    expect(renterCodeRecipient({ ...live, channel: 'text', phone: '+41791234567', phoneConfirmed: false, via: 'chosen' })).toEqual(email)
    expect(renterCodeRecipient({ ...live, channel: 'text', phone: null, phoneConfirmed: false, via: 'chosen' })).toEqual(email)
  })

  it('keeps the sandbox rule for email: a PayPal test account’s code goes to the booking contact', () => {
    expect(renterCodeRecipient({ paypalMode: 'sandbox', payerEmail: 'sb-1@personal.example.com', contactEmail: 'priya@gmail.com', channel: 'email', phone: null, phoneConfirmed: false, via: 'chosen' })).toEqual({ channel: 'email', email: 'priya@gmail.com', sandboxContact: true })
  })

  it('never goes to a phone nobody confirmed', () => {
    fc.assert(fc.property(fc.constantFrom('email', 'text' as const), fc.constantFrom('chosen', 'email' as const), fc.boolean(), (channel, via, phoneConfirmed) => {
      const recipient = renterCodeRecipient({ ...live, channel, phone: '+41791234567', phoneConfirmed, via })
      if (recipient.channel === 'text') expect(phoneConfirmed && channel === 'text' && via === 'chosen').toBe(true)
    }))
  })
})

describe('changing the number texts go to', () => {
  it('is free until the hold is placed at the counter, and needs a code from the trusted channel after', () => {
    expect(RENTAL_STATES.filter((state) => !contactChangeNeedsCode(state))).toEqual(['pending_payment', 'booked', 'awaiting_hold'])
  })
})

describe('the day’s emails Hold may be asked to send', () => {
  it('keep every pool together under the sending account’s day, with room left for sign-in codes', () => {
    // The pools are disjoint: demos' essential mail, demos' discretionary mail, real shops' essential mail, and real
    // shops' discretionary mail.
    const pools = EMAIL_LIMITS.demoEssentialPerDay + EMAIL_LIMITS.demoDiscretionaryPerDay + EMAIL_LIMITS.shopsEssentialPerDay + EMAIL_LIMITS.shopsDiscretionaryPerDay
    expect(pools).toBeLessThanOrEqual(SENDING_ACCOUNT.perDay - SENDING_ACCOUNT.signInHeadroom)
  })

  it('let one network, and one address across demos, have only a share of each of the demos’ pools', () => {
    expect(EMAIL_LIMITS.demoEssentialPerNetworkPerDay * 3).toBeLessThanOrEqual(EMAIL_LIMITS.demoEssentialPerDay)
    expect(EMAIL_LIMITS.demoDiscretionaryPerNetworkPerDay * 3).toBeLessThanOrEqual(EMAIL_LIMITS.demoDiscretionaryPerDay)
    expect(EMAIL_LIMITS.demoPerAddressPerDay * 3).toBeLessThanOrEqual(EMAIL_LIMITS.demoEssentialPerDay + EMAIL_LIMITS.demoDiscretionaryPerDay)
  })

  it('let no single real shop use up the real shops’ essential pool', () => {
    expect(EMAIL_LIMITS.perShopEssentialPerDay * 3).toBeLessThanOrEqual(EMAIL_LIMITS.shopsEssentialPerDay)
    expect(EMAIL_LIMITS.shopsDiscretionaryPerAddressPerDay * 3).toBeLessThanOrEqual(EMAIL_LIMITS.shopsDiscretionaryPerDay)
  })

  it('name as essential only what a renter needs to act on their own money', () => {
    expect((['renter_link', 'condition_link', 'renter_code', 'phone_code'] as const).every(emailIsEssential)).toBe(true)
    expect((['shop_message', 'drop_off', 'reminder', 'receipt'] as const).some(emailIsEssential)).toBe(false)
  })
})
