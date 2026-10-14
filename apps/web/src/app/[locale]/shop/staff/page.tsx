import { invitableRoles } from '@hold/domain'
import { inShop, listOpenInvitations, listStaff } from '@hold/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { readAccessToken } from '@/features/auth/session-cookies'
import { StaffScreen } from '@/features/shop/staff-screen'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.staff')
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function Page() {
  const context = await requireShop()
  const { database, identity } = await getServices()
  const scope = { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId } as const
  const [loaded, passkeys] = await Promise.all([
    inShop(database, scope, async (transaction) => ({ staff: await listStaff(transaction), invitations: await listOpenInvitations(transaction, new Date()) })),
    identity.listPasskeys((await readAccessToken()) ?? ''),
  ])
  return (
    <StaffScreen
      shopName={context.shop.name}
      currency={context.shop.currency}
      staff={loaded.staff}
      invitations={loaded.invitations}
      invitableRoles={invitableRoles(context.role)}
      gate={{ needed: context.passkeyNeeded, hasPasskey: passkeys.ok && passkeys.value.length > 0, email: context.person.email }}
    />
  )
}
