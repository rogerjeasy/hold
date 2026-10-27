import { randomUUID } from 'node:crypto'
import { money } from '@hold/domain'
import type { PriceEntryDraft } from '@hold/domain'
import { eq, inArray, sql } from 'drizzle-orm'
import { openShop } from './accounts.ts'
import { publishPriceList } from './price-list-repository.ts'
import { addSampleRentals } from './sample-rentals.ts'
import { auditLog, paypalAccounts, shops, staffRoles, users } from './schema/index.ts'
import type { Database, Transaction } from './scope.ts'

// The shop judges use (architecture.md section 20.3), as it is before anyone touches it: Tomás's bike shop in Lisbon,
// with Jonas at the counter, a published price list and the eleven sample rentals. Every sample is marked simulated.
export const DEMO_SHOP = {
  name: 'Ribeira Bikes',
  timeZone: 'Europe/Lisbon',
  currency: 'EUR',
  ownerName: 'Tomás',
  staffName: 'Jonas',
  // Above this a claim goes to the owner. Jonas's own limit is below it, so he approves small claims with no passkey.
  ownerApprovalThresholdCents: 150_00,
  staffApprovalLimitCents: 100_00,
  priceList: [
    { description: 'Scratch on the frame, through the paint', category: 'damage', amount: money(35_00, 'EUR') },
    { description: 'Bent rear derailleur hanger', category: 'damage', amount: money(25_00, 'EUR') },
    { description: 'Cracked e-bike display', category: 'damage', amount: money(120_00, 'EUR') },
    { description: 'Lost lock', category: 'loss', amount: money(45_00, 'EUR') },
    { description: 'Lost front light', category: 'loss', amount: money(20_00, 'EUR') },
    { description: 'Late return, per started day', category: 'lateness', amount: money(30_00, 'EUR') },
    { description: 'Cleaning after a muddy ride', category: 'cleaning', amount: money(15_00, 'EUR') },
  ] satisfies readonly PriceEntryDraft[],
  wearPolicy:
    'Light scuffs on tyres, pedals and grips are ordinary wear and are never charged. A mark already recorded at the handover is never charged again.',
} as const

// A demo account as Cognito knows it.
export type DemoPerson = { readonly subject: string; readonly email: string }

export type DemoShopInput = { readonly owner: DemoPerson; readonly staff: DemoPerson; readonly now: Date }

export type DemoShopResult = {
  readonly shopId: string
  readonly slug: string
  readonly rentals: number
  // The shop judges used until now, kept with every record and with nobody working in it.
  readonly archivedShopId: string | undefined
  readonly paypalMoved: boolean
}

// 2026-12-02 09:00 UTC, and 202612020900 for an address.
function stamp(now: Date): { readonly text: string; readonly compact: string } {
  const iso = now.toISOString()
  return { text: `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`, compact: iso.slice(0, 16).replace(/\D/g, '') }
}

// The shops the demo accounts work in now.
async function shopsInUse(transaction: Transaction, subjects: readonly string[]): Promise<readonly { readonly id: string; readonly name: string; readonly slug: string }[]> {
  return transaction
    .selectDistinct({ id: shops.id, name: shops.name, slug: shops.slug, createdAt: shops.createdAt })
    .from(shops)
    .innerJoin(staffRoles, eq(staffRoles.shopId, shops.id))
    .innerJoin(users, eq(users.id, staffRoles.userId))
    .where(inArray(users.cognitoSubject, [...subjects]))
    .orderBy(shops.createdAt)
}

// Returns the demo shop to its starting state, as the administrator, in one transaction. Nothing is deleted: the shop
// judges used is renamed and kept with every rental, money event and audit line, and only the roles in it end. The
// new shop takes its address and its PayPal connection, so the webhook PayPal knows keeps working.
// Runs as the tables' owner, hold_admin, which the app never is: the app's role may not end a role or move a
// connection between shops. The new shop itself is built as hold_app, inside its own scope, like any other.
export async function resetDemoShop(database: Database, input: DemoShopInput, newId: () => string = randomUUID): Promise<DemoShopResult> {
  const shopId = newId()
  const { text, compact } = stamp(input.now)
  return database.transaction(async (transaction) => {
    const previous = await shopsInUse(transaction, [input.owner.subject, input.staff.subject])
    for (const shop of previous) {
      await transaction
        .update(shops)
        .set({ name: `${shop.name} (archived ${text})`, slug: `${shop.slug}-archived-${compact}` })
        .where(eq(shops.id, shop.id))
      await transaction.delete(staffRoles).where(eq(staffRoles.shopId, shop.id))
      await transaction.insert(auditLog).values({ shopId: shop.id, actorKind: 'system', action: 'demo.archived', subjectKind: 'shop', subjectId: shop.id, detail: { replacedBy: shopId }, at: input.now })
    }

    await transaction.execute(sql`select set_config('role', 'hold_app', true), set_config('hold.shop_id', ${shopId}, true), set_config('hold.user_id', '', true)`)
    const owner = await openShop(transaction, shopId, { ...input.owner, name: DEMO_SHOP.ownerName, language: 'en', shop: { name: DEMO_SHOP.name, timeZone: DEMO_SHOP.timeZone } })
    await transaction.execute(sql`select set_config('hold.user_id', ${owner.userId}, true)`)
    const published = await publishPriceList(
      transaction,
      shopId,
      { currency: DEMO_SHOP.currency, entries: DEMO_SHOP.priceList, wearPolicy: DEMO_SHOP.wearPolicy, ownerApprovalThreshold: money(DEMO_SHOP.ownerApprovalThresholdCents, DEMO_SHOP.currency) },
      input.now,
    )
    if (!published.ok) throw new Error(`The demo price list was refused: ${published.reason}.`)
    const [staff] = await transaction
      .select({ userId: sql<string>`registered.id` })
      .from(sql`hold_register_user(${input.staff.subject}, ${input.staff.email}, ${DEMO_SHOP.staffName}, 'en') as registered(id)`)
    if (staff === undefined) throw new Error('hold_register_user returned no row.')
    await transaction.insert(staffRoles).values({ shopId, userId: staff.userId, role: 'counter_staff', approvalLimitCents: DEMO_SHOP.staffApprovalLimitCents })
    const samples = await addSampleRentals(transaction, { shopId, userId: owner.userId, timeZone: DEMO_SHOP.timeZone, now: input.now })
    if (!samples.ok) throw new Error(`The sample rentals were refused: ${samples.reason}.`)
    const [shop] = await transaction.select({ slug: shops.slug }).from(shops).where(eq(shops.id, shopId))
    if (shop === undefined) throw new Error('The demo shop was not created.')
    await transaction.execute(sql`reset role`)

    // The newest connection moves. An older archived shop's, if there were ever two, stays where it is.
    const archived = previous.at(-1)
    let paypalMoved = false
    if (archived !== undefined) {
      const moved = await transaction.update(paypalAccounts).set({ shopId }).where(eq(paypalAccounts.shopId, archived.id)).returning({ id: paypalAccounts.id })
      paypalMoved = moved.length > 0
    }
    await transaction.insert(auditLog).values({ shopId, actorKind: 'system', action: 'demo.reset', subjectKind: 'shop', subjectId: shopId, detail: { simulated: true, archived: archived?.id ?? null, paypalMoved }, at: input.now })
    return { shopId, slug: shop.slug, rentals: samples.rentals, archivedShopId: archived?.id, paypalMoved }
  })
}
