import { money } from '@hold/domain'
import type { PriceEntryDraft } from '@hold/domain'
import { sql } from 'drizzle-orm'
import { addItems, saveItemType } from './item-repository.ts'
import { publishPriceList } from './price-list-repository.ts'
import { addSampleRentals } from './sample-rentals.ts'
import { staffRoles } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// The shop every demo session starts with (architecture.md section 20.3): Tomás's bike shop in Lisbon, with Jonas at
// the counter, a published price list, four real bikes to book and the eleven sample rentals. Every sample is marked simulated.
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
  // Real bikes beside the samples, so a judge can book one at the counter, on the shop page or through an assistant
  // and take it through a live sandbox hold. Only the frame must be photographed: the sample photographs are of it.
  bookable: {
    name: 'City bike',
    category: 'bike',
    count: 4,
    valueCents: 900_00,
    holdCents: 250_00,
    dayRateCents: 25_00,
    views: [
      { label: 'Frame, drive side', outline: 'whole_side', required: true },
      { label: 'Front wheel', outline: 'front', required: false },
      { label: 'Rear wheel', outline: 'rear', required: false },
    ],
  },
  wearPolicy:
    'Light scuffs on tyres, pedals and grips are ordinary wear and are never charged. A mark already recorded at the handover is never charged again.',
} as const

// A demo account as Cognito knows it.
export type DemoPerson = { readonly subject: string; readonly email: string }

// Everything the demo shop starts with after its owner: the published price list and wear policy, Jonas at the
// counter, and the sample rentals. Runs as hold_app in a transaction bound to the new shop, whose owner it names.
export async function furnishDemoShop(transaction: Transaction, shopId: string, ownerUserId: string, staffPerson: DemoPerson, now: Date): Promise<{ readonly rentals: number }> {
  await transaction.execute(sql`select set_config('hold.user_id', ${ownerUserId}, true)`)
  const published = await publishPriceList(
    transaction,
    shopId,
    { currency: DEMO_SHOP.currency, entries: DEMO_SHOP.priceList, wearPolicy: DEMO_SHOP.wearPolicy, ownerApprovalThreshold: money(DEMO_SHOP.ownerApprovalThresholdCents, DEMO_SHOP.currency) },
    now,
  )
  if (!published.ok) throw new Error(`The demo price list was refused: ${published.reason}.`)
  const [staff] = await transaction
    .select({ userId: sql<string>`registered.id` })
    .from(sql`hold_register_user(${staffPerson.subject}, ${staffPerson.email}, ${DEMO_SHOP.staffName}, 'en') as registered(id)`)
  if (staff === undefined) throw new Error('hold_register_user returned no row.')
  await transaction.insert(staffRoles).values({ shopId, userId: staff.userId, role: 'counter_staff', approvalLimitCents: DEMO_SHOP.staffApprovalLimitCents })
  const bike = DEMO_SHOP.bookable
  const eur = (cents: number) => money(cents, DEMO_SHOP.currency)
  const saved = await saveItemType(
    transaction,
    shopId,
    { draft: { name: bike.name, category: bike.category, currency: DEMO_SHOP.currency, value: eur(bike.valueCents), hold: eur(bike.holdCents), dayRate: eur(bike.dayRateCents), accessories: [], views: bike.views } },
    now,
  )
  if (!saved.ok) throw new Error(`The demo item type was refused: ${saved.reason}.`)
  const added = await addItems(transaction, { itemTypeId: saved.id, count: bike.count, size: '', serial: '' }, now)
  if (!added.ok) throw new Error(`The demo bikes were refused: ${added.reason}.`)
  const samples = await addSampleRentals(transaction, { shopId, userId: ownerUserId, raisedByUserId: staff.userId, timeZone: DEMO_SHOP.timeZone, now })
  if (!samples.ok) throw new Error(`The sample rentals were refused: ${samples.reason}.`)
  return { rentals: samples.rentals }
}
