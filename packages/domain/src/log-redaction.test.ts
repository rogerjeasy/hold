import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { errorForLog, redactForLog } from './log-redaction.ts'

describe('redacting text for a log', () => {
  it.each([
    ['an email address', 'No renter for renter.name+tag@example.co.uk in shop', 'renter.name+tag@example.co.uk'],
    ['a bearer token', 'GET /v1/me failed with Authorization: Bearer A21AAKx9-abc.def_ghi', 'A21AAKx9-abc.def_ghi'],
    ['an access token in a body', '{"access_token":"A21AAFEpH4PsZ9xVn","token_type":"Bearer"}', 'A21AAFEpH4PsZ9xVn'],
    ['a client secret', 'client_secret=EKmQ7sF2-very-secret', 'EKmQ7sF2-very-secret'],
    ['a password', 'password: hunter2-and-more', 'hunter2-and-more'],
    ['a PayPal token in a URL', 'https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T&useraction=pay', '5O190127TN364715T'],
    ['a PayPal billing token in a URL', 'https://www.paypal.com/agreements/approve?ba_token=BA-8A802366G0648845Y', 'BA-8A802366G0648845Y'],
    ['a payer in a URL', 'https://hold.example/paypal/return?token=7XU&PayerID=QYR5Z8XDVJNXQ', 'QYR5Z8XDVJNXQ'],
    ['a long hex secret', 'key 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 refused', '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'],
    ['a long base64 secret', 'secret dGhpcyBpcyBhIHNlY3JldCBrZXkgZm9yIEhvbGQgMTIzNDU2Nzg5MA== was wrong', 'dGhpcyBpcyBhIHNlY3JldCBrZXkgZm9yIEhvbGQgMTIzNDU2Nzg5MA'],
    ['a renter link', 'https://hold.example/r/Zx3kQ9_aLm2PqR7sT8uVwXyZ01bC4dE5fG6hI7jK8lMnOpQ2rS3tU4vW5xY6zA7bB8cC9dD0eE1fF2gG3hH4iI', 'Zx3kQ9_aLm2PqR7sT8uVwXyZ01bC4dE5fG6hI7jK8lMnOpQ2rS3tU4vW5xY6zA7bB8cC9dD0eE1fF2gG3hH4iI'],
    ['a signed-in token', 'cookie eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl', 'eyJzdWIiOiIxMjMifQ'],
    ['a phone number', 'Text to +351912345678 failed', '+351912345678'],
  ])('removes %s', (_kind, text, secret) => {
    const redacted = redactForLog(text)
    expect(redacted).not.toContain(secret)
    expect(redacted).toContain('[redacted]')
  })

  it('removes the values a failed query carried, up to the stack', () => {
    const text = 'Failed query: select hold_renter_for_payer($1, $2)\nparams: PAYER1,Ana Silva\nRua das Flores 12\n    at query (/var/task/index.mjs:1:2045)'
    const redacted = redactForLog(text)
    expect(redacted).toContain('Failed query: select hold_renter_for_payer($1, $2)')
    expect(redacted).not.toContain('PAYER1')
    expect(redacted).not.toContain('Ana Silva')
    expect(redacted).not.toContain('Rua das Flores')
    expect(redacted).toContain('at query (/var/task/index.mjs:1:2045)')
  })

  it('keeps what a reader needs to find the fault: names, identifiers and stack frames', () => {
    const text = [
      'DatabaseResumingException: The Aurora DB instance hold-database-writer is resuming after being auto-paused.',
      'rental 0b9f6a3c-2d1e-4c8a-9f0e-6a1b2c3d4e5f has no hold',
      '    at resume (/var/task/node_modules/@aws-sdk/client-rds-data/dist-cjs/index.js:812:21)',
      '    at async relayOutbox (file:///var/task/outbox-relay-lambda.mjs:3:118)',
    ].join('\n')
    expect(redactForLog(text)).toBe(text)
  })

  it('never lets an email address through, wherever it sits', () => {
    const local = fc.stringMatching(/^[a-z0-9._%+-]{1,20}$/)
    const domain = fc.stringMatching(/^[a-z0-9-]{1,15}\.[a-z]{2,6}$/)
    fc.assert(
      fc.property(fc.string(), local, domain, fc.string(), (before, user, host, after) => {
        const address = `${user}@${host}`
        expect(redactForLog(`${before} ${address} ${after}`)).not.toContain(address)
      }),
    )
  })
})

describe('an error for a log', () => {
  it('gives the name, the redacted message and the stack', () => {
    const error = new Error('No renter for ana@example.com')
    error.name = 'RenterMissing'
    const logged = errorForLog(error)
    expect(logged).toContain('RenterMissing: No renter for [redacted]')
    expect(logged).not.toContain('ana@example.com')
    expect(logged).toMatch(/\n\s+at /)
  })

  it('follows the cause, where a failed query keeps the database’s own reason', () => {
    const cause = new Error('Database returned an error for token=A21AAFEpH4PsZ9xVn')
    cause.name = 'BadRequestException'
    const error = new Error('Failed query: select 1\nparams: renter@example.com', { cause })
    error.name = 'DrizzleQueryError'
    const logged = errorForLog(error)
    expect(logged).toContain('DrizzleQueryError: Failed query: select 1')
    expect(logged).toContain('Caused by BadRequestException: Database returned an error for token=[redacted]')
    expect(logged).not.toContain('renter@example.com')
    expect(logged).not.toContain('A21AAFEpH4PsZ9xVn')
  })

  it('stops at a cause that refers back to itself', () => {
    const error = new Error('loop')
    Object.assign(error, { cause: error })
    expect(errorForLog(error).match(/Caused by/g)?.length ?? 0).toBeLessThanOrEqual(3)
  })

  it('describes something thrown that is not an error, redacted', () => {
    expect(errorForLog('failed for ana@example.com')).toBe('failed for [redacted]')
    expect(errorForLog(undefined)).toBe('unknown error')
  })
})
