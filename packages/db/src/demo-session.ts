import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { openShop } from './accounts.ts'
import { DEMO_SHOP, furnishDemoShop } from './demo-shop.ts'
import type { DemoPerson } from './demo-shop.ts'
import { auditLog, shops } from './schema/index.ts'
import { inShop, outsideShop } from './scope.ts'
import type { Database } from './scope.ts'
import { savePayPalAccount, saveWebhookId } from './shop-repository.ts'
import type { PayPalMode } from './shop-repository.ts'

// One judge's demo (architecture.md section 20.3): a shop of their own, as the demo shop starts, with that session's
// two accounts as its owner and counter staff. Built by the web app as hold_app, bound to the new shop alone, as a
// sign-up is, so it can touch no other shop. The shop is marked as a demo session, which keeps it out of the shops
// renters' assistants can find. It shares the demo's PayPal sandbox connection, by reference to the same secret, and
// the app's one webhook, whose events reach it through demoAccountForRental: PayPal allows an app only ten addresses.

export type DemoSessionInput = {
  readonly owner: DemoPerson
  readonly staff: DemoPerson
  // Asked for, not guessed from the name, so one judge cannot find another's shop by counting.
  readonly slug: string
  // webhookId: the shared app's subscription, when it has one. Without it the shop reads every step back from PayPal.
  readonly paypal: { readonly credentialReference: string; readonly mode: PayPalMode; readonly webhookId?: string } | undefined
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
    if (input.paypal !== undefined) {
      await savePayPalAccount(transaction, shopId, input.paypal.mode, input.paypal.credentialReference)
      if (input.paypal.webhookId !== undefined) await saveWebhookId(transaction, shopId, input.paypal.mode, input.paypal.webhookId)
    }
    await transaction.insert(auditLog).values({ shopId, actorKind: 'system', action: 'demo.session_started', subjectKind: 'shop', subjectId: shopId, detail: { simulated: true, paypal: input.paypal !== undefined }, at: input.now })
    const [shop] = await transaction.select({ slug: shops.slug }).from(shops).where(eq(shops.id, shopId))
    if (shop === undefined) throw new Error('The demo session’s shop was not created.')
    return { shopId, slug: shop.slug, rentals: furnished.rentals }
  })
}

// The PayPal account of the demo shop whose rental an event names in its custom_id, read before any shop is chosen.
// Nothing for a rental that is not a demo shop's, so the demo's shared webhook address reaches no real shop.
export async function demoAccountForRental(database: Database, rentalId: string, mode: PayPalMode): Promise<string | undefined> {
  const [row] = await outsideShop(database, (transaction) => transaction.select({ id: sql<string | null>`hold_demo_paypal_account(${rentalId}, ${mode})` }).from(sql`(select 1) as one`))
  return row?.id ?? undefined
}
