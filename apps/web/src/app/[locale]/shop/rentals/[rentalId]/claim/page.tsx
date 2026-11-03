import { claimMessages, claimWorkspace, inShop, listStaff, promiseFor, rentalDetail, shopNegotiation } from '@hold/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { ClaimScreen } from '@/features/claims/claim-screen'
import { sampleAdvocatesAllowance } from '@/features/negotiation/limits'
import { RECORDED_RUN } from '@/features/negotiation/recorded-run'
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
  const now = new Date()
  const { data, negotiation, contest, promise, messages, rental, staffCount } = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, async (transaction) => ({ data: await claimWorkspace(transaction, rentalId), negotiation: await shopNegotiation(transaction, rentalId), contest: await contestViewFor(transaction, rentalId, 'shop'), promise: await promiseFor(transaction, rentalId, now), messages: await claimMessages(transaction, rentalId), rental: await rentalDetail(transaction, rentalId, now), staffCount: (await listStaff(transaction)).length }))
  if (data === undefined) notFound()
  const keys = [...new Set(data.lines.flatMap((line) => [line.beforeKey, line.afterKey]).filter((key): key is string => key !== null))]
  // A sample claim waiting for its reply offers the advocates: today's live runs left, and the recorded live run.
  const sampleAdvocates = data.simulated && data.claim?.state === 'presented' && negotiation === undefined ? { allowance: await sampleAdvocatesAllowance(context.shop.id), recording: RECORDED_RUN } : undefined
  const photoUrls: Readonly<Record<string, string>> = evidence === undefined ? {} : Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await evidence.displayLink(key)] as const)))
  return <ClaimScreen photoUrls={photoUrls} shopName={context.shop.name} timeZone={context.shop.timeZone} data={data} canAct={context.role !== 'read_only'} canDecide={context.role === 'owner' || context.role === 'manager'} passkey={await passkeyGate(context)} negotiation={negotiation} contest={contest} promise={promise ?? null} messages={data.claim === null || ['draft', 'awaiting_approval', 'approved'].includes(data.claim.state) ? undefined : messages} renterName={rental?.who ?? null} isOwner={context.role === 'owner'} now={now} sampleAdvocates={sampleAdvocates} viewer={{ userId: context.person.userId, role: context.role, approvalLimitCents: context.approvalLimitCents, staffCount }} />
}
