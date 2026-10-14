import { sql } from 'drizzle-orm'
import { money } from '@hold/domain'
import { findPerson, registerOwner } from '../src/accounts.ts'
import { currentPriceList, publishPriceList } from '../src/price-list-repository.ts'
import { takeRateToken } from '../src/rate-limit.ts'
import { inShop } from '../src/scope.ts'
import { acceptInvitation, createInvitation, findInvitation, listStaff } from '../src/staff-repository.ts'
import { createDataApiDatabase } from '../src/data-api.ts'
import { shops } from '../src/schema/index.ts'

// Checks the deployed database as the services see it, logged in as hold_app, and leaves nothing behind: the
// sign-up runs inside an outer transaction that is rolled back.
const clusterArn = process.env['HOLD_DATABASE_CLUSTER_ARN'] ?? ''
const secretArn = process.env['HOLD_DATABASE_APP_SECRET_ARN'] ?? ''
const database = createDataApiDatabase({ region: process.env['HOLD_AWS_REGION'] ?? 'us-east-1', clusterArn, secretArn, database: 'hold_db' })

const [who] = await database.select({ user: sql<string>`current_user` }).from(sql`(select 1) as one`)
console.log('logged in as', who?.user)
console.log('shops seen outside any scope:', (await database.select().from(shops)).length)

const ROLLBACK = new Error('rolled back on purpose')
const subject = `check-${String(Date.now())}`
try {
  await database.transaction(async (outer) => {
    const registered = await registerOwner(outer, {
      subject,
      email: 'check@hold.example',
      name: 'Check',
      language: 'en',
      shop: { name: 'Check Shop', timeZone: 'Europe/Zurich' },
    })
    console.log('registered', registered)
    console.log('found', JSON.stringify(await findPerson(outer, subject)))
    const owner = { role: 'hold_app', shopId: registered.shopId, userId: registered.userId } as const
    const now = new Date()
    const published = await inShop(outer, owner, (transaction) =>
      publishPriceList(
        transaction,
        registered.shopId,
        {
          currency: 'CHF',
          ownerApprovalThreshold: money(200_00, 'CHF'),
          entries: [{ description: 'Deep scratch', category: 'damage', amount: money(35_00, 'CHF') }],
          wearPolicy: 'Light scuffs are ordinary wear.',
        },
        now,
      ),
    )
    console.log('published', JSON.stringify(published), JSON.stringify((await inShop(outer, owner, currentPriceList))?.entries))
    const { token } = await inShop(outer, owner, (transaction) =>
      createInvitation(transaction, { shopId: registered.shopId, invitedByUserId: registered.userId, email: 'staff@hold.example', role: 'counter_staff', approvalLimitCents: 50_00, language: 'en' }, now),
    )
    console.log('invitation', (await findInvitation(outer, token, now))?.state)
    console.log('accepted', JSON.stringify(await acceptInvitation(outer, { token, subject: `${subject}-staff`, email: 'staff@hold.example', name: 'Staff', language: 'en' }, now)))
    console.log('staff', JSON.stringify((await inShop(outer, owner, listStaff)).map((member) => member.role)))
    console.log('rate limit', await takeRateToken(outer, { name: 'check', max: 1, windowSeconds: 60 }, subject), await takeRateToken(outer, { name: 'check', max: 1, windowSeconds: 60 }, subject))
    throw ROLLBACK
  })
} catch (error) {
  if (error !== ROLLBACK) throw error
}
console.log('after the rollback, the check person is', (await findPerson(database, subject)) === undefined ? 'gone' : 'STILL THERE')
