import { describe, expect, it } from 'vitest'
import { pushDataSchema } from './push'
import { renterActions } from './renter-actions'
import { signOutInput, STAFF_ACTIONS } from './staff'

const TOKEN = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]'
const SHOP = '6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b'

describe('registering a phone for push notifications', () => {
  it('takes an Expo push token and the platform, from a renter and from staff alike', () => {
    expect(renterActions['register-push'].input.safeParse({ pushToken: TOKEN, platform: 'ios' }).success).toBe(true)
    expect(STAFF_ACTIONS['register-push'].input.safeParse({ pushToken: TOKEN, platform: 'android', locale: 'fr' }).success).toBe(true)
    expect(renterActions['register-push'].output.parse({ reference: 'abc' })).toEqual({ reference: 'abc' })
  })

  it('refuses anything that is not an Expo push token, or a platform Hold does not build for, or a field more', () => {
    for (const pushToken of ['', 'abc', 'https://evil.example', `${TOKEN} `]) expect(renterActions['register-push'].input.safeParse({ pushToken, platform: 'ios' }).success).toBe(false)
    expect(renterActions['register-push'].input.safeParse({ pushToken: TOKEN, platform: 'web' }).success).toBe(false)
    expect(renterActions['register-push'].input.safeParse({ pushToken: TOKEN, platform: 'ios', rentalId: SHOP }).success).toBe(false)
    expect(STAFF_ACTIONS['register-push'].input.safeParse({ pushToken: TOKEN, platform: 'ios', locale: 'en', userId: SHOP }).success).toBe(false)
  })

  it('lets signing out name the phone, so its registration ends with the session', () => {
    expect(signOutInput.safeParse({ refreshToken: 'r', pushToken: TOKEN }).success).toBe(true)
    expect(signOutInput.safeParse({ refreshToken: 'r' }).success).toBe(true)
    expect(signOutInput.safeParse({ refreshToken: 'r', pushToken: 'nope' }).success).toBe(false)
  })
})

describe('what a push carries, as the phone reads it', () => {
  it('is a renter’s reference and a page of the rental, or a counter screen in a shop', () => {
    expect(pushDataSchema.parse({ kind: 'renter', reference: 'Zk3J9q0bWb1yXc2V4n6m8A', page: 'claim' })).toEqual({ kind: 'renter', reference: 'Zk3J9q0bWb1yXc2V4n6m8A', page: 'claim' })
    expect(pushDataSchema.parse({ kind: 'staff', shopId: SHOP, path: '/shop/drop-offs' })).toEqual({ kind: 'staff', shopId: SHOP, path: '/shop/drop-offs' })
  })

  it('is refused for any other page or path, since anyone holding a phone’s token can send it a push', () => {
    expect(pushDataSchema.safeParse({ kind: 'renter', reference: 'r', page: 'pay' }).success).toBe(false)
    expect(pushDataSchema.safeParse({ kind: 'staff', shopId: SHOP, path: '/shop/account' }).success).toBe(false)
    expect(pushDataSchema.safeParse({ kind: 'staff', shopId: 'not-a-shop', path: '/shop/drop-offs' }).success).toBe(false)
    expect(pushDataSchema.safeParse({ kind: 'other' }).success).toBe(false)
  })
})
