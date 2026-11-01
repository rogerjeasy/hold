import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isExpoPushToken, isStaffPushPath, PUSH_FOR_TEXT, RENTER_PUSH_PAGES, staffPushPath, STAFF_PUSH_ROLES } from './push.ts'
import { TEXT_PURPOSES } from './renter-contact.ts'

describe('the address of a phone for push notifications', () => {
  it('is an Expo push token, in either of the forms Expo hands out', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true)
    expect(isExpoPushToken('ExpoPushToken[AbC-123_xyz]')).toBe(true)
  })

  it('is nothing else: a raw device token, a link, an empty or an over-long one', () => {
    for (const value of ['', 'ExponentPushToken[]', 'ExponentPushToken[abc', 'abcd1234', 'https://example.com', 'ExponentPushToken[a b]', `ExponentPushToken[${'a'.repeat(300)}]`]) expect(isExpoPushToken(value)).toBe(false)
  })
})

describe('what a renter’s phone is told', () => {
  it('never carries a one-time code or the link itself: those go only by text or email', () => {
    expect(PUSH_FOR_TEXT.renter_code).toBeUndefined()
    expect(PUSH_FOR_TEXT.phone_code).toBeUndefined()
    expect(PUSH_FOR_TEXT.renter_link).toBeUndefined()
  })

  it('opens a page of the rental for every message that is pushed', () => {
    for (const purpose of TEXT_PURPOSES) {
      const event = PUSH_FOR_TEXT[purpose]
      if (event !== undefined) expect(Object.keys(RENTER_PUSH_PAGES)).toContain(event)
    }
  })
})

describe('what a member of staff’s phone opens', () => {
  const id = '6f1c1e0e-3d2b-4c8e-9a51-2f7b5c1d9e10'

  it('is a counter screen the app has, and nothing else', () => {
    expect(staffPushPath({ to: 'rental', id })).toBe(`/shop/rental/${id}`)
    expect(staffPushPath({ to: 'review', id })).toBe(`/shop/review/${id}`)
    expect(staffPushPath({ to: 'drop_offs' })).toBe('/shop/drop-offs')
    for (const path of [staffPushPath({ to: 'rental', id }), staffPushPath({ to: 'review', id }), staffPushPath({ to: 'drop_offs' })]) expect(isStaffPushPath(path)).toBe(true)
  })

  it('refuses any other path a push might name, since anyone holding a phone’s token can send it one', () => {
    fc.assert(fc.property(fc.string(), (path) => {
      if (isStaffPushPath(path)) expect(path).toMatch(/^\/shop\/(rental|review)\/[0-9a-f-]{36}$|^\/shop\/drop-offs$/)
    }))
    for (const path of ['/shop/rental/../account', 'https://evil.example/shop/drop-offs', '/r/token/claim', '/shop/rental/abc', `/shop/rental/${id}/item/x`]) expect(isStaffPushPath(path)).toBe(false)
  })

  it('reaches only those who decide when a decision waits, and the counter for its own work', () => {
    expect(STAFF_PUSH_ROLES.decision_waiting).toEqual(['owner', 'manager'])
    for (const roles of Object.values(STAFF_PUSH_ROLES)) expect(roles).not.toContain('read_only')
  })
})
