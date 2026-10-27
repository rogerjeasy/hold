import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { slugOf } from '@hold/domain'
import type { StaffRole } from '@hold/domain'
import { auditLog, shops, staffRoles } from './schema/index.ts'
import { inShop, outsideShop } from './scope.ts'
import type { Database, Transaction } from './scope.ts'

// The owner of a new shop, as Cognito verified them and as they introduced themselves on the sign-up form.
export type NewOwner = {
  readonly subject: string
  readonly email: string
  readonly name: string
  readonly language: string
  // slug: the address to ask for, when it is not to be made from the name. demoSession: a demo session's shop.
  readonly shop: { readonly name: string; readonly timeZone: string; readonly slug?: string; readonly demoSession?: boolean }
}

export type RegisteredOwner = { readonly userId: string; readonly shopId: string }

// Creates the shop and makes the person its owner, in one transaction. A person who already has an account keeps
// it, and gains a second shop: one person may own several.
export function registerOwner(database: Database, owner: NewOwner, newId: () => string = randomUUID): Promise<RegisteredOwner> {
  const shopId = newId()
  // The shop is new, so nobody has a role in it yet. The transaction is bound to it alone.
  return inShop(database, { role: 'hold_app', shopId }, (transaction) => openShop(transaction, shopId, owner))
}

// The shop's row, its owner's role and its first audit line, in a transaction already bound to the new shop.
export async function openShop(transaction: Transaction, shopId: string, owner: NewOwner): Promise<RegisteredOwner> {
  const [registered] = await transaction
    .select({ userId: sql<string>`registered.id` })
    .from(sql`hold_register_user(${owner.subject}, ${owner.email}, ${owner.name}, ${owner.language}) as registered(id)`)
  if (registered === undefined) throw new Error('hold_register_user returned no row.')
  const { userId } = registered
  const [address] = await transaction.select({ slug: sql<string>`hold_free_shop_slug(${owner.shop.slug ?? (slugOf(owner.shop.name) || 'shop')})` }).from(sql`(select 1) as one`)
  if (address === undefined) throw new Error('hold_free_shop_slug returned no row.')
  await transaction.insert(shops).values({ id: shopId, name: owner.shop.name, slug: address.slug, timeZone: owner.shop.timeZone, demoSession: owner.shop.demoSession ?? false })
  await transaction.insert(staffRoles).values({ shopId, userId, role: 'owner' })
  await transaction.insert(auditLog).values({
    shopId,
    actorKind: 'person',
    actorId: userId,
    action: 'shop.created',
    subjectKind: 'shop',
    subjectId: shopId,
  })
  return { userId, shopId }
}

export type PersonShop = { readonly shopId: string; readonly name: string; readonly role: StaffRole }

export type Person = {
  readonly userId: string
  readonly email: string
  readonly name: string | null
  // Oldest first. Empty for a person who has an account and no shop yet.
  readonly shops: readonly PersonShop[]
}

// The person a verified token names, with every shop they have a role in. Nothing for a subject Hold has not seen.
export async function findPerson(database: Database, subject: string): Promise<Person | undefined> {
  const rows = await outsideShop(database, (transaction) =>
    transaction
      .select({
        userId: sql<string>`user_id`,
        email: sql<string>`email`,
        name: sql<string | null>`name`,
        shopId: sql<string | null>`shop_id`,
        shopName: sql<string | null>`shop_name`,
        role: sql<StaffRole | null>`role`,
      })
      .from(sql`hold_shops_of_subject(${subject})`),
  )
  const [first] = rows
  if (first === undefined) return undefined
  const shopsOfPerson = rows.flatMap((row) =>
    row.shopId === null || row.shopName === null || row.role === null ? [] : [{ shopId: row.shopId, name: row.shopName, role: row.role }],
  )
  return { userId: first.userId, email: first.email, name: first.name, shops: shopsOfPerson }
}
