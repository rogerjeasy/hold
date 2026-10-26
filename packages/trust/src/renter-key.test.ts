import { describe, expect, it } from 'vitest'
import { renterKeyFor } from './renter-key.ts'

const secret = Buffer.alloc(32, 3)

describe('the renter key', () => {
  it('is the same for the same PayPal payer, so the record follows the wallet from shop to shop', () => {
    expect(renterKeyFor(secret)('PAYER123')).toBe(renterKeyFor(secret)('PAYER123'))
  })

  it('differs between payers', () => {
    expect(renterKeyFor(secret)('PAYER123')).not.toBe(renterKeyFor(secret)('PAYER124'))
  })

  it('cannot be made without Hold’s secret', () => {
    expect(renterKeyFor(Buffer.alloc(32, 4))('PAYER123')).not.toBe(renterKeyFor(secret)('PAYER123'))
  })

  it('carries nothing of the payer ID', () => {
    const key = renterKeyFor(secret)('PAYER123')
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(key).not.toContain('PAYER')
  })

  it('refuses a short secret', () => {
    expect(() => renterKeyFor(Buffer.alloc(8))).toThrow(/32 bytes/)
  })
})
