import { addItems, createBooking, inShop, publishPriceList, registerOwner, registerRenterPush, registerStaffPush, renterLinks, requestPhoneCode, saveItemType } from '@hold/db'
import { createTestDatabase } from '@hold/db/testing'
import { money } from '@hold/domain'
import { createMemoryMailer, createMemoryPushSender, createMemoryTexter } from '@hold/notify'
import { describe, expect, it } from 'vitest'
import { createNotifier } from './notifier.ts'

const eur = (cents: number) => money(cents, 'EUR')

async function shopWithRental() {
  const database = await createTestDatabase()
  const owner = await registerOwner(database, { subject: 'owner', email: 'ana@ribeira.example', name: 'Ana', language: 'de', shop: { name: 'Ribeira Bikes', timeZone: 'UTC' } })
  const scope = { role: 'hold_app', shopId: owner.shopId, userId: owner.userId } as const
  const rentalId = await inShop(database, scope, async (transaction) => {
    await publishPriceList(transaction, owner.shopId, { currency: 'EUR', ownerApprovalThreshold: undefined, entries: [{ description: 'Scratch', category: 'damage', amount: eur(35_00) }], wearPolicy: 'Wear.' }, new Date())
    const type = await saveItemType(transaction, owner.shopId, { draft: { name: 'E-bike', category: 'e_bike', currency: 'EUR', value: eur(2400_00), hold: eur(300_00), dayRate: eur(40_00), accessories: [], views: [{ label: 'Frame', outline: 'whole_side', required: true }] } }, new Date())
    if (!type.ok) throw new Error(type.reason)
    await addItems(transaction, { itemTypeId: type.id, count: 1, size: '', serial: '' }, new Date())
    const startsAt = new Date(Date.now() + 86_400_000)
    const booked = await createBooking(
      transaction,
      owner.shopId,
      { startsAt, endsAt: new Date(startsAt.getTime() + 86_400_000), lines: [{ itemTypeId: type.id, count: 1 }], contact: { name: 'Priya Natarajan', email: 'priya@example.com' }, language: 'fr', bookedThrough: 'staff', link: { fingerprint: 'f-1', expiresAt: new Date('2027-01-01') } },
      new Date(),
    )
    if (!booked.ok) throw new Error(booked.reason)
    return booked.rentalId
  })
  return { database, shopId: owner.shopId, ownerId: owner.userId, rentalId }
}

describe('telling people from the worker', () => {
  it('emails each owner, in their language, that a hold expired, with a link to the rental', async () => {
    const { database, shopId, rentalId } = await shopWithRental()
    const mailer = createMemoryMailer()
    await createNotifier({ database, mailer, texter: createMemoryTexter(), publicUrl: 'https://hold.test' }).tell({ kind: 'hold_expired', shopId, rentalId })
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0]).toMatchObject({ to: 'ana@ribeira.example', subject: 'Eine Reservierung ist abgelaufen: Priya Natarajan' })
    expect(mailer.sent[0]?.text).toContain(`https://hold.test/de/shop/rentals/${rentalId}`)
    expect(mailer.sent[0]?.text).toContain('300,00')
  })

  it('emails each owner, in their language, that a promised decision was missed, with a link to the claim', async () => {
    const { database, shopId, rentalId } = await shopWithRental()
    const mailer = createMemoryMailer()
    await createNotifier({ database, mailer, texter: createMemoryTexter(), publicUrl: 'https://hold.test' }).tell({ kind: 'promise_missed', shopId, rentalId, waived: false })
    expect(mailer.sent).toHaveLength(2)
    expect(mailer.sent[0]).toMatchObject({ to: 'ana@ribeira.example', subject: 'Zugesagte Entscheidung verpasst: Priya Natarajan' })
    expect(mailer.sent[1]).toMatchObject({ to: 'priya@example.com', subject: 'Ribeira Bikes n’a pas décidé de votre réclamation à temps' })
    expect(mailer.sent[0]?.text).toContain(`https://hold.test/de/shop/rentals/${rentalId}/claim`)
  })

  it('throws when an email could not be sent, so the queue tries again', async () => {
    const { database, shopId, rentalId } = await shopWithRental()
    const notifier = createNotifier({ database, mailer: { send: () => Promise.resolve(false) }, texter: createMemoryTexter(), publicUrl: 'https://hold.test' })
    await expect(notifier.tell({ kind: 'hold_expired', shopId, rentalId })).rejects.toThrow(/could not be sent/)
  })

  it('asks the renter, in the rental’s language, to approve a new hold, with the link and when the old one ends', async () => {
    const { database, shopId, rentalId } = await shopWithRental()
    const mailer = createMemoryMailer()
    const approveUrl = 'https://hold.test/fr/r/TOKEN/pay'
    await createNotifier({ database, mailer, texter: createMemoryTexter(), publicUrl: 'https://hold.test' }).tell({ kind: 'hold_replacement', shopId, rentalId, approveUrl, holdEndsAt: new Date('2026-11-14T09:00:00Z') })
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0]).toMatchObject({ to: 'priya@example.com', subject: 'Veuillez approuver une nouvelle empreinte pour votre location chez Ribeira Bikes' })
    expect(mailer.sent[0]?.text).toContain(approveUrl)
    expect(mailer.sent[0]?.text).toContain('14 nov.')
  })

  it('texts the renter who chose texts, both the request for a new hold and a missed promise, and still emails the owners', async () => {
    const { database, shopId, rentalId } = await shopWithRental()
    await inShop(database, { role: 'hold_app', shopId }, (transaction) => requestPhoneCode(transaction, rentalId, { typed: '+33 6 12 34 56 78', hash: 'code', stepUp: false }, new Date()))
    const mailer = createMemoryMailer()
    const texter = createMemoryTexter()
    const notifier = createNotifier({ database, mailer, texter, publicUrl: 'https://hold.test' })
    await notifier.tell({ kind: 'hold_replacement', shopId, rentalId, approveUrl: 'https://hold.test/fr/r/TOKEN/pay', holdEndsAt: new Date('2026-11-14T09:00:00Z') })
    await notifier.tell({ kind: 'promise_missed', shopId, rentalId, waived: true })
    expect(texter.sent.map((text) => text.body)).toEqual([expect.stringContaining('https://hold.test/fr/r/TOKEN/pay'), expect.stringContaining('rien n\'est débité')])
    expect(mailer.sent.map((email) => email.to)).toEqual(['ana@ribeira.example'])
  })
})

describe('pushing to the phone app from the worker', () => {
  it('tells the owners’ phones a decision waits, and the renter’s phone, beside its text or email, what happened', async () => {
    const { database, shopId, ownerId, rentalId } = await shopWithRental()
    const [link] = await database.select().from(renterLinks)
    await inShop(database, { role: 'hold_app', shopId, userId: ownerId }, async (transaction) => {
      await registerStaffPush(transaction, { shopId, userId: ownerId }, { token: 'ExponentPushToken[owner]', platform: 'ios', locale: 'de' }, new Date())
      await registerRenterPush(transaction, { id: link?.id ?? '', shopId, rentalId }, { token: 'ExponentPushToken[renter]', platform: 'android', locale: 'fr' }, 'renter-reference', new Date())
    })
    const push = createMemoryPushSender()
    const notifier = createNotifier({ database, mailer: createMemoryMailer(), texter: createMemoryTexter(), push, publicUrl: 'https://hold.test' })
    await notifier.tell({ kind: 'promise_missed', shopId, rentalId, waived: false })
    await notifier.tell({ kind: 'hold_expired', shopId, rentalId })
    await notifier.tell({ kind: 'hold_replacement', shopId, rentalId, approveUrl: 'https://hold.test/fr/r/TOKEN/pay', holdEndsAt: new Date('2026-11-14T09:00:00Z') })
    expect(push.sent.map((message) => [message.to, message.data])).toEqual([
      ['ExponentPushToken[owner]', { kind: 'staff', shopId, path: `/shop/rental/${rentalId}` }],
      ['ExponentPushToken[renter]', { kind: 'renter', reference: 'renter-reference', page: 'claim' }],
      ['ExponentPushToken[owner]', { kind: 'staff', shopId, path: `/shop/rental/${rentalId}` }],
      ['ExponentPushToken[renter]', { kind: 'renter', reference: 'renter-reference', page: 'rental' }],
    ])
    expect(JSON.stringify(push.sent)).not.toContain('TOKEN')
  })

  it('still tells everyone by email when Expo is down', async () => {
    const { database, shopId, rentalId } = await shopWithRental()
    const mailer = createMemoryMailer()
    const down = { send: () => Promise.reject(new Error('Expo is down')), receipts: () => Promise.reject(new Error('Expo is down')) }
    await createNotifier({ database, mailer, texter: createMemoryTexter(), push: down, publicUrl: 'https://hold.test' }).tell({ kind: 'promise_missed', shopId, rentalId, waived: false })
    expect(mailer.sent).toHaveLength(2)
  })
})
