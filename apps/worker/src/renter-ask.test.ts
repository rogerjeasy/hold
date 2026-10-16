import { readRenterToken, renterLinkKey } from '@hold/auth'
import { addItems, createBooking, findRenterLink, inShop, publishPriceList, registerOwner, saveItemType } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import { money } from '@hold/domain'
import { describe, expect, it } from 'vitest'
import { createWorkerRenterAsk } from './renter-ask.ts'

const eur = (cents: number) => money(cents, 'EUR')
const LINK_SECRET = Buffer.alloc(32, 5)

describe('asking a renter for a new hold, from the worker', () => {
  it('issues a new link to the rental’s hold page, signed with the renter-link key, in the rental’s language', async () => {
    const database = await createTestDatabase()
    const owner = await registerOwner(database, { subject: 'owner', email: 'ana@ribeira.example', name: 'Ana', language: 'en', shop: { name: 'Ribeira Bikes', timeZone: 'UTC' } })
    const rentalId = await inShop(database, { role: 'hold_app', shopId: owner.shopId, userId: owner.userId }, async (transaction) => {
      await publishPriceList(transaction, owner.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: eur(35_00) }], wearPolicy: 'Wear.' }, new Date())
      const type = await saveItemType(transaction, owner.shopId, { draft: { name: 'E-bike', category: 'e_bike', currency: 'EUR', value: eur(2400_00), hold: eur(300_00), dayRate: eur(40_00), accessories: [], views: [{ label: 'Frame', outline: 'whole_side', required: true }] } }, new Date())
      if (!type.ok) throw new Error(type.reason)
      await addItems(transaction, { itemTypeId: type.id, count: 1, size: '', serial: '' }, new Date())
      const startsAt = new Date(Date.now() + 86_400_000)
      const booked = await createBooking(transaction, owner.shopId, { startsAt, endsAt: new Date(startsAt.getTime() + 86_400_000), lines: [{ itemTypeId: type.id, count: 1 }], contact: undefined, language: 'de', bookedThrough: 'staff', link: { fingerprint: 'f-1', expiresAt: new Date('2027-01-01') } }, new Date())
      if (!booked.ok) throw new Error(booked.reason)
      return booked.rentalId
    })

    const asked = await createWorkerRenterAsk({ database, publicUrl: 'https://hold.test', linkKey: () => Promise.resolve(LINK_SECRET) }).approval(owner.shopId, rentalId)

    expect(asked.url).toMatch(/^https:\/\/hold\.test\/de\/r\/[A-Za-z0-9_-]{65}\/pay$/)
    expect(asked.orderDescription).toBe('Rückzahlbare Reservierung für Ihre Miete bei Ribeira Bikes. Keine Abbuchung.')
    const token = asked.url.split('/r/')[1]?.replace('/pay', '') ?? ''
    const read = readRenterToken(renterLinkKey(LINK_SECRET), token)
    expect(read).toBeDefined()
    expect(await findRenterLink(database, read?.fingerprint ?? '')).toMatchObject({ rentalId, scopes: ['view', 'pay'] })
  })
})
