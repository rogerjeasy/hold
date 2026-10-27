import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { openShop } from './accounts.ts'
import { DEMO_SHOP, furnishDemoShop } from './demo-shop.ts'
import type { DemoPerson } from './demo-shop.ts'
import { auditLog, shops } from './schema/index.ts'
import { inShop } from './scope.ts'
import type { Database } from './scope.ts'
import { savePayPalAccount } from './shop-repository.ts'
import type { PayPalMode } from './shop-repository.ts'

// One judge's demo (architecture.md section 20.3): a shop of their own, as the demo shop starts, with that session's
// two accounts as its owner and counter staff. Built by the web app as hold_app, bound to the new shop alone, as a
// sign-up is, so it can touch no other shop. The shop is marked as a demo session, which keeps it out of the shops
// renters' assistants can find. It shares the demo's PayPal sandbox connection, by reference to the same secret, with
// no webhook of its own: PayPal allows an app ten webhook addresses, and Hold reads every step back from PayPal anyway.

export type DemoSessionInput = {
  readonly owner: DemoPerson
  readonly staff: DemoPerson
  // Asked for, not guessed from the name, so one judge cannot find another's shop by counting.
  readonly slug: string
  readonly paypal: { readonly credentialReference: string; readonly mode: PayPalMode } | undefined
  readonly now: Date
}

export type OpenedDemoSession = { readonly shopId: string; readonly slug: string; readonly rentals: number }

export function openDemoSession(database: Database, input: DemoSessionInput, newId: () => string = randomUUID): Promise<OpenedDemoSession> {
  const shopId = newId()
  return inShop(database, { role: 'hold_app', shopId }, async (transaction) => {
    const owner = await openShop(transaction, shopId, {
      ...input.owner,
      name: DEMO_SHOP.ownerName,
      language: 'en',
      shop: { name: DEMO_SHOP.name, timeZone: DEMO_SHOP.timeZone, slug: input.slug, demoSession: true },
    })
    const furnished = await furnishDemoShop(transaction, shopId, owner.userId, input.staff, input.now)
    if (input.paypal !== undefined) await savePayPalAccount(transaction, shopId, input.paypal.mode, input.paypal.credentialReference)
    await transaction.insert(auditLog).values({ shopId, actorKind: 'system', action: 'demo.session_started', subjectKind: 'shop', subjectId: shopId, detail: { simulated: true, paypal: input.paypal !== undefined }, at: input.now })
    const [shop] = await transaction.select({ slug: shops.slug }).from(shops).where(eq(shops.id, shopId))
    if (shop === undefined) throw new Error('The demo session’s shop was not created.')
    return { shopId, slug: shop.slug, rentals: furnished.rentals }
  })
}
