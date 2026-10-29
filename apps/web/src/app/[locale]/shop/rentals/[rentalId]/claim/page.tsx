import { claimWorkspace, inShop, shopNegotiation } from '@hold/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { ClaimScreen } from '@/features/claims/claim-screen'
import { contestViewFor } from '@/server/contest-view'
import { passkeyGate } from '@/server/passkey-gate'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('claim'))('title'), robots: { index: false, follow: false } }
}
export default async function Page({ params }: { params: Promise<{ rentalId: string }> }) {
  const context = await requireShop()
  const { rentalId } = await params
  if (!z.uuid().safeParse(rentalId).success) notFound()
  const { database, evidence } = await getServices()
  const { data, negotiation, contest } = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, async (transaction) => ({ data: await claimWorkspace(transaction, rentalId), negotiation: await shopNegotiation(transaction, rentalId), contest: await contestViewFor(transaction, rentalId, 'shop') }))
  if (data === undefined) notFound()
  const keys = [...new Set(data.lines.flatMap((line) => [line.beforeKey, line.afterKey]).filter((key): key is string => key !== null))]
  const photoUrls: Readonly<Record<string, string>> = evidence === undefined ? {} : Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await evidence.displayLink(key)] as const)))
  return <ClaimScreen photoUrls={photoUrls} shopName={context.shop.name} timeZone={context.shop.timeZone} data={data} canAct={context.role !== 'read_only'} canDecide={context.role === 'owner' || context.role === 'manager'} passkey={await passkeyGate(context)} negotiation={negotiation} contest={contest} />
}
