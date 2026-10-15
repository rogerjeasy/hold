import { eq, is, sql } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from './schema/index.ts'
import { itemTypes, photoPlans, renters, rentals, shops, staffRoles, users } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Scope, Transaction } from './scope.ts'
import { createTestDatabase } from './testing/test-database.ts'
import type { TestDatabase } from './testing/test-database.ts'

const SHOP_A = '00000000-0000-4000-8000-00000000000a'
const SHOP_B = '00000000-0000-4000-8000-00000000000b'
const OWNER_A = '00000000-0000-4000-8000-0000000000a1'
const OWNER_B = '00000000-0000-4000-8000-0000000000b1'
const APPEND_ONLY = ['money_events', 'approvals', 'audit_log']

let database: TestDatabase

// Drizzle wraps PostgreSQL's error. The database's own message is its cause.
async function refusal(work: Promise<unknown>): Promise<string> {
  try {
    await work
  } catch (error) {
    return error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error)
  }
  return 'not refused'
}

async function rows<Row>(query: ReturnType<typeof sql>): Promise<Row[]> {
  return (await database.execute(query)).rows as Row[]
}

beforeAll(async () => {
  database = await createTestDatabase()
  await database.insert(users).values([
    { id: OWNER_A, cognitoSubject: 'cognito-a', email: 'owner@shop-a.test' },
    { id: OWNER_B, cognitoSubject: 'cognito-b', email: 'owner@shop-b.test' },
  ])
  const shop = { timeZone: 'Europe/Zurich', currency: 'CHF', ownerApprovalThresholdCents: 200_00 }
  await database.insert(shops).values([
    { ...shop, id: SHOP_A, name: 'Shop A' },
    { ...shop, id: SHOP_B, name: 'Shop B' },
  ])
  await database.insert(staffRoles).values([
    { shopId: SHOP_A, userId: OWNER_A, role: 'owner' },
    { shopId: SHOP_B, userId: OWNER_B, role: 'owner' },
  ])
  await database.insert(photoPlans).values([
    { shopId: SHOP_A, name: 'E-bike', views: [] },
    { shopId: SHOP_B, name: 'Kayak', views: [] },
  ])
})

describe('every table', () => {
  it('has row-level security and at least one policy', async () => {
    const unprotected = await rows<{ name: string }>(sql`
      select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and (not c.relrowsecurity or not exists (select 1 from pg_policy p where p.polrelid = c.oid))`)
    expect(unprotected).toEqual([])
  })

  it('uses no enum types, which the RDS Data API cannot compare with its text parameters', async () => {
    expect(await rows(sql`select typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e'`)).toEqual([])
  })

  it('refuses a value outside a column’s fixed list, sent as text the way the Data API sends it', async () => {
    expect(await rows(sql`select count(*)::int as count from staff_roles where role = ${'owner'}::text`)).toEqual([{ count: 2 }])
    expect(
      await refusal(database.execute(sql`insert into staff_roles (shop_id, user_id, role) values (${SHOP_B}, ${OWNER_A}, ${'emperor'}::text)`)),
    ).toMatch(/role_allowed/)
  })

  it('has a check constraint for every column with a fixed list of values', () => {
    const unchecked = Object.values(schema)
      .filter((value) => is(value, PgTable))
      .flatMap((table) => {
        const config = getTableConfig(table)
        const checks = new Set(config.checks.map((constraint) => constraint.name))
        return config.columns
          .filter((column) => column.enumValues !== undefined && column.enumValues.length > 0 && !checks.has(`${column.name}_allowed`))
          .map((column) => `${config.name}.${column.name}`)
      })
    expect(unchecked).toEqual([])
  })

  it('is owned by neither service role, so row-level security applies to both', async () => {
    const owned = await rows(sql`select tablename from pg_tables where schemaname = 'public' and tableowner in ('hold_app', 'hold_worker')`)
    expect(owned).toEqual([])
  })

  it('refuses the service roles any delete, and any update to the append-only tables', async () => {
    const granted = await rows<{ table_name: string; privilege_type: string }>(sql`
      select table_name, privilege_type from information_schema.role_table_grants
      where grantee in ('hold_app', 'hold_worker') and table_schema = 'public'`)
    expect(granted.filter((grant) => grant.privilege_type === 'DELETE')).toEqual([])
    expect(granted.filter((grant) => grant.privilege_type === 'UPDATE' && APPEND_ONLY.includes(grant.table_name))).toEqual([])
  })
})

describe('a transaction scoped to one shop', () => {
  const ownerOfA: Scope = { role: 'hold_app', shopId: SHOP_A, userId: OWNER_A }

  it('sees only that shop', async () => {
    const seen = await inShop(database, ownerOfA, (transaction) => transaction.select({ name: photoPlans.name }).from(photoPlans))
    expect(seen).toEqual([{ name: 'E-bike' }])
  })

  it('sees nothing when a person with no role there names the shop', async () => {
    const seen = await inShop(database, { role: 'hold_app', shopId: SHOP_A, userId: OWNER_B }, (transaction) =>
      transaction.select().from(photoPlans),
    )
    expect(seen).toEqual([])
  })

  it('refuses to write a row into another shop', async () => {
    expect(await refusal(inShop(database, ownerOfA, (transaction) => transaction.insert(photoPlans).values({ shopId: SHOP_B, name: 'Planted', views: [] })))).toMatch(/row-level security/)
  })

  it('cannot move a row into another shop', async () => {
    // Photo plans are never updated at all (migration 0010), so an updatable table shows the policy at work.
    const [plan] = await database.select({ id: photoPlans.id }).from(photoPlans).where(eq(photoPlans.shopId, SHOP_A))
    await database.insert(itemTypes).values({ shopId: SHOP_A, name: 'E-bike', category: 'e_bike', currency: 'CHF', valueCents: 1, holdCents: 1, dayRateCents: 1, photoPlanId: plan?.id ?? '' })
    expect(await refusal(inShop(database, ownerOfA, (transaction) => transaction.update(itemTypes).set({ shopId: SHOP_B })))).toMatch(/row-level security/)
  })

  it('cannot delete anything', async () => {
    expect(await refusal(inShop(database, ownerOfA, (transaction) => transaction.delete(photoPlans)))).toMatch(/permission denied/)
  })

  it('sees the people of its own shop and no others', async () => {
    const seen = await inShop(database, ownerOfA, (transaction) => transaction.select({ email: users.email }).from(users))
    expect(seen).toEqual([{ email: 'owner@shop-a.test' }])
  })

  it.each([
    ['a worker job', { role: 'hold_worker', shopId: SHOP_B }],
    ['a renter link', { role: 'hold_app', shopId: SHOP_B }],
  ] as const)('works for %s, which names no person', async (_, scope) => {
    const seen = await inShop(database, scope, (transaction) => transaction.select({ name: photoPlans.name }).from(photoPlans))
    expect(seen).toEqual([{ name: 'Kayak' }])
  })
})

describe('a query outside any scope', () => {
  it('sees nothing at all', async () => {
    const seen = await database.transaction(async (transaction) => {
      await transaction.execute(sql`select set_config('role', 'hold_app', true)`)
      return transaction.select().from(photoPlans)
    })
    expect(seen).toEqual([])
  })
})

describe('renters', () => {
  it('are found or created through PayPal identity, and seen only by shops they rented from', async () => {
    const payer = async (transaction: Transaction): Promise<unknown> => {
      const [found] = await transaction
        .select({ id: sql<string>`hold_renter_for_payer('PAYER-1', 'renter@example.test', 'Renter One')` })
        .from(sql`(values (1)) as one`)
      return found?.id
    }
    const renterId = String(await inShop(database, { role: 'hold_worker', shopId: SHOP_A }, payer))
    expect(await inShop(database, { role: 'hold_worker', shopId: SHOP_B }, payer)).toBe(renterId)

    const [priceList] = await database.execute<{ id: string }>(sql`
      insert into price_lists (shop_id, version, currency) values (${SHOP_A}, 1, 'CHF') returning id`).then((result) => result.rows)
    const [wearPolicy] = await database.execute<{ id: string }>(sql`
      insert into wear_policies (shop_id, version, rules) values (${SHOP_A}, 1, 'Ordinary scuffs') returning id`).then((result) => result.rows)
    await database.insert(rentals).values({
      shopId: SHOP_A,
      renterId,
      startsAt: new Date('2026-10-20T09:00:00Z'),
      endsAt: new Date('2026-10-23T17:00:00Z'),
      currency: 'CHF',
      feeCents: 90_00,
      priceListId: String(priceList?.id),
      wearPolicyId: String(wearPolicy?.id),
    })

    const seenByA = await inShop(database, { role: 'hold_app', shopId: SHOP_A, userId: OWNER_A }, (transaction) =>
      transaction.select({ email: renters.email }).from(renters),
    )
    const seenByB = await inShop(database, { role: 'hold_app', shopId: SHOP_B, userId: OWNER_B }, (transaction) =>
      transaction.select().from(renters),
    )
    expect(seenByA).toEqual([{ email: 'renter@example.test' }])
    expect(seenByB).toEqual([])
  })

  it('cannot be written directly by a service', async () => {
    expect(await refusal(inShop(database, { role: 'hold_app', shopId: SHOP_A }, (transaction) =>
        transaction.insert(renters).values({ paypalPayerId: 'PAYER-2', email: 'forged@example.test' }),
      ))).toMatch(/permission denied/)
  })
})
