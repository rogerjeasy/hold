import { eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { findPerson, personInShop, registerOwner } from './accounts.ts'
import type { NewOwner, Person, PersonShop } from './accounts.ts'
import { auditLog, shops, users } from './schema/index.ts'
import { inShop } from './scope.ts'
import { savePayPalAccount } from './shop-repository.ts'
import { countStatements } from './testing/statement-count.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

let database: TestDatabase

const owner: NewOwner = {
  subject: 'cognito-sub-tomas',
  email: 'tomas@ribeirabikes.example',
  name: 'Tomás',
  language: 'pt',
  shop: { name: 'Ribeira Bikes', timeZone: 'Europe/Lisbon' },
}

async function refusal(work: Promise<unknown>): Promise<string> {
  try {
    await work
  } catch (error) {
    return error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error)
  }
  return 'not refused'
}

beforeAll(async () => {
  database = await createTestDatabase()
})

describe('registering an owner', () => {
  it('creates the person, the shop and their role as owner, and records it', async () => {
    const { userId, shopId } = await registerOwner(database, owner)

    expect(await findPerson(database, owner.subject)).toEqual({
      userId,
      email: owner.email,
      name: 'Tomás',
      shops: [{ shopId, name: 'Ribeira Bikes', role: 'owner' }],
    })
    const [shop] = await database.select().from(shops).where(eq(shops.id, shopId))
    expect(shop).toMatchObject({ timeZone: 'Europe/Lisbon', currency: null, ownerApprovalThresholdCents: null })
    const [line] = await database.select().from(auditLog).where(eq(auditLog.shopId, shopId))
    expect(line).toMatchObject({ actorKind: 'person', actorId: userId, action: 'shop.created', subjectId: shopId })
  })

  it('gives a person who already has an account a second shop, and keeps their name', async () => {
    const second = await registerOwner(database, { ...owner, name: 'Someone Else', shop: { name: 'Ribeira Kayaks', timeZone: 'Europe/Lisbon' } })

    const person = await findPerson(database, owner.subject)
    expect(person?.userId).toBe(second.userId)
    expect(person?.name).toBe('Tomás')
    expect(person?.shops.map((shop) => shop.name)).toEqual(['Ribeira Bikes', 'Ribeira Kayaks'])
  })

  it('lets the owner work in the new shop, and nobody else', async () => {
    const { userId, shopId } = await registerOwner(database, { ...owner, subject: 'cognito-sub-ana', email: 'ana@lisboa.example' })
    const stranger = await registerOwner(database, { ...owner, subject: 'cognito-sub-rui', email: 'rui@porto.example' })

    const seenByOwner = await inShop(database, { role: 'hold_app', shopId, userId }, (transaction) => transaction.select({ id: shops.id }).from(shops))
    const seenByStranger = await inShop(database, { role: 'hold_app', shopId, userId: stranger.userId }, (transaction) =>
      transaction.select().from(shops),
    )
    expect(seenByOwner).toEqual([{ id: shopId }])
    expect(seenByStranger).toEqual([])
  })

  it('does not let a service write a person directly', async () => {
    expect(
      await refusal(
        inShop(database, { role: 'hold_app', shopId: '00000000-0000-4000-8000-000000000001' }, (transaction) =>
          transaction.insert(users).values({ cognitoSubject: 'forged', email: 'forged@example.test' }),
        ),
      ),
    ).toMatch(/permission denied/)
  })
})

describe('finding a person', () => {
  it('finds nobody for a subject Hold has not seen', async () => {
    expect(await findPerson(database, 'cognito-sub-unknown')).toBeUndefined()
  })

  it('finds a person with an account and no shop', async () => {
    await database.execute(sql`select hold_register_user('cognito-sub-staff', 'staff@example.test', null, 'en')`)
    expect(await findPerson(database, 'cognito-sub-staff')).toMatchObject({ email: 'staff@example.test', name: null, shops: [] })
  })
})

describe('entering a shop as a signed-in person', () => {
  const first = (person: Person) => person.shops[0]

  it('reads the person, the shop they chose, their role there and whether PayPal is connected, in one transaction of four statements', async () => {
    const { shopId } = await registerOwner(database, { ...owner, subject: 'cognito-sub-entry', email: 'entry@ribeirabikes.example', shop: { name: 'Entry Bikes', timeZone: 'Europe/Lisbon' } })
    await inShop(database, { role: 'hold_app', shopId }, (transaction) => savePayPalAccount(transaction, shopId, 'sandbox', 'hold/paypal/shops/entry/sandbox'))

    const { result, count } = await countStatements(database, () => personInShop(database, 'cognito-sub-entry', first, 'sandbox'))

    expect(result.person).toMatchObject({ email: 'entry@ribeirabikes.example', shops: [{ shopId, name: 'Entry Bikes', role: 'owner' }] })
    expect(result.entry).toMatchObject({ settings: { id: shopId, name: 'Entry Bikes', timeZone: 'Europe/Lisbon' }, role: 'owner', approvalLimitCents: 0, paypalConnected: true })
    // Choosing the role, finding the person, binding the shop, then the shop with the role: every page waits for these.
    expect(count).toEqual({ statements: 4, transactions: 1, longest: 4 })
    expect((await personInShop(database, 'cognito-sub-entry', first, 'live')).entry?.paypalConnected).toBe(false)
  })

  it('enters no shop the person has no role in, even when it is the one chosen', async () => {
    const other = await registerOwner(database, { ...owner, subject: 'cognito-sub-elsewhere', email: 'elsewhere@example.test', shop: { name: 'Elsewhere Bikes', timeZone: 'UTC' } })
    await registerOwner(database, { ...owner, subject: 'cognito-sub-chooser', email: 'chooser@example.test', shop: { name: 'Chooser Bikes', timeZone: 'UTC' } })
    const elsewhere = (): PersonShop => ({ shopId: other.shopId, name: 'Elsewhere Bikes', role: 'owner' })

    const { person, entry } = await personInShop(database, 'cognito-sub-chooser', elsewhere, 'sandbox')

    expect(person?.email).toBe('chooser@example.test')
    expect(entry).toBeUndefined()
  })

  it('enters nothing for a subject Hold has not seen, or for a person with no shop', async () => {
    expect(await personInShop(database, 'cognito-sub-nobody', first, 'sandbox')).toEqual({ person: undefined, entry: undefined })
    await database.execute(sql`select hold_register_user('cognito-sub-shopless', 'shopless@example.test', null, 'en')`)
    expect(await personInShop(database, 'cognito-sub-shopless', first, 'sandbox')).toMatchObject({ person: { shops: [] }, entry: undefined })
  })
})
