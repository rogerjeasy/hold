import { createDemoAccountAdmin, ensureDemoAccounts } from '@hold/auth'
import { resetDemoShop } from '@hold/db'
import { createDataApiDatabase } from '@hold/db/data-api'

// Returns the demo shop judges use to its starting state (architecture.md section 20.3), as an administrator:
//   AWS_PROFILE=wick-dev pnpm demo:reset
// with the settings below in the environment. It makes the demo accounts and their secret if missing, removes the
// passkeys and ends the sessions judges left, archives the shop they used with every record in it, and builds a fresh
// one at the same address with the shop's PayPal connection. Safe to run again at any time.

type Setting = 'HOLD_COGNITO_USER_POOL_ID' | 'HOLD_COGNITO_CLIENT_ID' | 'HOLD_DATABASE_CLUSTER_ARN' | 'HOLD_DATABASE_ADMIN_SECRET_ARN'

function setting(name: Setting): string {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`${name} is not set.`)
  return value
}

const region = process.env['HOLD_AWS_REGION'] ?? 'us-east-1'
const secretName = process.env['HOLD_DEMO_ACCOUNTS_SECRET'] ?? 'hold/web/demo-accounts'
const emails = {
  owner: process.env['HOLD_DEMO_OWNER_EMAIL'] ?? 'tomas.demo@hold.example',
  staff: process.env['HOLD_DEMO_STAFF_EMAIL'] ?? 'jonas.demo@hold.example',
}
const cognito = { region, userPoolId: setting('HOLD_COGNITO_USER_POOL_ID'), clientId: setting('HOLD_COGNITO_CLIENT_ID') }
const admin = createDataApiDatabase({
  region,
  clusterArn: setting('HOLD_DATABASE_CLUSTER_ARN'),
  secretArn: setting('HOLD_DATABASE_ADMIN_SECRET_ARN'),
  database: process.env['HOLD_DATABASE_NAME'] ?? 'hold_db',
})

const accounts = await ensureDemoAccounts(secretName, emails, region)
const people = createDemoAccountAdmin(cognito)
const owner = await people.prepare({ ...accounts.owner, group: 'owner' })
const staff = await people.prepare({ ...accounts.staff, group: 'staff' })
console.log(`Demo accounts ready. Passkeys removed: ${String(owner.passkeysRemoved + staff.passkeysRemoved)}. Every session ended.`)

const reset = await resetDemoShop(admin, {
  owner: { subject: owner.subject, email: accounts.owner.email },
  staff: { subject: staff.subject, email: accounts.staff.email },
  now: new Date(),
})
console.log(`Demo shop ready at /s/${reset.slug} with ${String(reset.rentals)} sample rentals.`)
console.log(reset.archivedShopId === undefined ? 'No earlier demo shop to archive.' : `The shop judges used is archived, with every record in it.`)
console.log(reset.paypalMoved ? 'The PayPal sandbox connection moved to the new shop.' : 'No PayPal connection yet: sign in as the demo owner and connect the sandbox account on the PayPal page.')
