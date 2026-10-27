import { addItems, createBooking, inShop, publishPriceList, registerOwner, saveItemType } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import { money } from '@hold/domain'
import { createMemoryMailer } from '@hold/notify'
import { expect, it } from 'vitest'
import { createReminderSender } from './reminder-sender.ts'

const eur = (cents: number) => money(cents, 'EUR')

it('emails the renter the reminder in their language, with the due time in the shop\'s time zone', async () => {
  const database = await createTestDatabase()
  const owner = await registerOwner(database, { subject: 'owner', email: 'ana@ribeira.example', name: 'Ana', language: 'en', shop: { name: 'Ribeira Bikes', timeZone: 'Europe/Lisbon' } })
  const rentalId = await inShop(database, { role: 'hold_app', shopId: owner.shopId, userId: owner.userId }, async (transaction) => {
    await publishPriceList(transaction, owner.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: eur(35_00) }], wearPolicy: 'Wear.' }, new Date())
    const type = await saveItemType(transaction, owner.shopId, { draft: { name: 'E-bike', category: 'e_bike', currency: 'EUR', value: eur(2400_00), hold: eur(300_00), dayRate: eur(40_00), accessories: [], views: [{ label: 'Frame', outline: 'whole_side', required: true }] } }, new Date())
    if (!type.ok) throw new Error(type.reason)
    await addItems(transaction, { itemTypeId: type.id, count: 1, size: '', serial: '' }, new Date())
    const startsAt = new Date(Date.now() + 86_400_000)
    const booked = await createBooking(transaction, owner.shopId, { startsAt, endsAt: new Date(startsAt.getTime() + 86_400_000), lines: [{ itemTypeId: type.id, count: 1 }], contact: { name: 'Priya Natarajan', email: 'priya@example.com' }, language: 'fr', bookedThrough: 'staff', link: { fingerprint: 'f-1', expiresAt: new Date('2027-01-01') } }, new Date())
    if (!booked.ok) throw new Error(booked.reason)
    return booked.rentalId
  })
  const mailer = createMemoryMailer()
  await createReminderSender({ database, mailer })({ kind: 'return_due', shopId: owner.shopId, rentalId, dueAt: new Date('2026-10-20T17:00:00Z') })
  expect(mailer.sent).toHaveLength(1)
  expect(mailer.sent[0]).toMatchObject({ to: 'priya@example.com', subject: 'Le retour de votre location chez Ribeira Bikes est attendu' })
  expect(mailer.sent[0]?.text).toContain('18:00')
})
