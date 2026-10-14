import { eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { findPerson, registerOwner } from './accounts.ts'
import type { NewOwner } from './accounts.ts'
import { auditLog, shops, users } from './schema/index.ts'
import { inShop } from './scope.ts'
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
