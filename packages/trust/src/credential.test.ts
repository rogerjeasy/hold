import type { CleanRecord } from '@hold/domain'
import { describe, expect, it } from 'vitest'
import { CREDENTIAL_MINUTES, issueCredential } from './credential.ts'
import { verifyCredential } from './verify.ts'
import { createLocalSigner } from './local-signer.ts'
import { renterKeyFor } from './renter-key.ts'

const NOW = new Date('2026-10-26T09:00:00Z')
const MINUTE = 60_000
const record: CleanRecord = { clean: 5, settled: 1, unpaid: 0, open: 0, shops: 2, windowMonths: 24 }
const renterKey = renterKeyFor(Buffer.alloc(32, 5))('PAYERPRIYA42')

const segments = (token: string) => token.split('.')
const decode = (part: string | undefined): unknown => JSON.parse(Buffer.from(part ?? '', 'base64url').toString('utf8'))

describe('a Clean Record credential', () => {
  it('verifies with the published public key alone, and shows the counts', async () => {
    const signer = createLocalSigner()
    const token = await issueCredential(signer, renterKey, record, NOW)
    expect(await verifyCredential(token, [await signer.publicKey()], new Date(NOW.getTime() + MINUTE))).toEqual({
      ok: true,
      value: { renterKey, record, issuedAt: NOW, expiresAt: new Date(NOW.getTime() + CREDENTIAL_MINUTES * MINUTE) },
    })
  })

  it('is short-lived', () => {
    expect(CREDENTIAL_MINUTES).toBeLessThanOrEqual(15)
  })

  it('fails once changed', async () => {
    const signer = createLocalSigner()
    const [header, , signature] = segments(await issueCredential(signer, renterKey, record, NOW))
    const better = Buffer.from(JSON.stringify({ ...(decode(segments(await issueCredential(signer, renterKey, record, NOW))[1]) as object), rec: { ...record, clean: 50 } })).toString('base64url')
    expect(await verifyCredential(`${header ?? ''}.${better}.${signature ?? ''}`, [await signer.publicKey()], NOW)).toEqual({ ok: false, error: 'bad_signature' })
  })

  it('fails once expired', async () => {
    const signer = createLocalSigner()
    const token = await issueCredential(signer, renterKey, record, NOW)
    expect(await verifyCredential(token, [await signer.publicKey()], new Date(NOW.getTime() + CREDENTIAL_MINUTES * MINUTE))).toEqual({ ok: false, error: 'expired' })
  })

  it('fails when issued in the future', async () => {
    const signer = createLocalSigner()
    const token = await issueCredential(signer, renterKey, record, new Date(NOW.getTime() + 10 * MINUTE))
    expect(await verifyCredential(token, [await signer.publicKey()], NOW)).toEqual({ ok: false, error: 'not_yet_valid' })
  })

  it('fails when signed by another key, even one claiming Hold’s key ID', async () => {
    const hold = createLocalSigner()
    const other = createLocalSigner()
    expect(await verifyCredential(await issueCredential(other, renterKey, record, NOW), [await hold.publicKey()], NOW)).toEqual({ ok: false, error: 'unknown_key' })
    const impostor = { ...other, keyId: hold.keyId }
    expect(await verifyCredential(await issueCredential(impostor, renterKey, record, NOW), [await hold.publicKey()], NOW)).toEqual({ ok: false, error: 'bad_signature' })
  })

  it.each([
    ['not a token', 'nonsense'],
    ['an unsigned token', `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.e30.`],
    ['too long a token', 'a'.repeat(5000)],
  ])('refuses %s', async (_, token) => {
    expect(await verifyCredential(token, [await createLocalSigner().publicKey()], NOW)).toEqual({ ok: false, error: 'malformed' })
  })

  it('contains no name, email, payer ID, shop identifier or amount (X2.5)', async () => {
    const token = await issueCredential(createLocalSigner(), renterKey, record, NOW)
    const [header, payload] = segments(token)
    expect(Object.keys(decode(header) as object).sort()).toEqual(['alg', 'kid', 'typ'])
    const claims = decode(payload) as Record<string, unknown>
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'iss', 'rec', 'sub'])
    expect(claims['rec']).toEqual({ clean: 5, settled: 1, unpaid: 0, open: 0, shops: 2, window_months: 24 })
    expect(claims['sub']).toBe(renterKey)
    const text = Buffer.from(payload ?? '', 'base64url').toString('utf8')
    for (const personal of ['PAYERPRIYA42', 'Priya', '@', 'shop_', 'shopId', 'CHF', 'EUR', 'cents', 'amount']) expect(text).not.toContain(personal)
  })
})
