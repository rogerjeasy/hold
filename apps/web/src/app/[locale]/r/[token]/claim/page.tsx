import { claimMessages, claimRepairs, claimWorkspace, inShop, promiseFor, rentalAssistant, renterNegotiation, renterView } from '@hold/db'
import { claimReplyAllowed } from '@hold/domain'
import { getTranslations } from 'next-intl/server'
import { LinkRefused } from '@/features/renter/link-refused'
import { RenterClaimScreen } from '@/features/claims/renter-claim-screen'
import { contestViewFor } from '@/server/contest-view'
import { renterAccess } from '@/server/renter-access'
import { renterPageMetadata } from '@/server/renter-page'
import { getServices } from '@/server/services'
export async function generateMetadata() { return renterPageMetadata((await getTranslations('claim'))('renterTitle')) }
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const now = new Date()
  const access = await renterAccess(token, 'view', now)
  if (!access.ok) return <LinkRefused failure={access.failure} />
  const { database, evidence } = await getServices()
  const loaded = await inShop(database, { role: 'hold_app', shopId: access.link.shopId }, async (transaction) => ({ workspace: await claimWorkspace(transaction, access.link.rentalId), rental: await renterView(transaction, access.link.rentalId, now), negotiation: await renterNegotiation(transaction, access.link.rentalId), assistant: await rentalAssistant(transaction, access.link.rentalId), contest: await contestViewFor(transaction, access.link.rentalId, 'renter'), promise: await promiseFor(transaction, access.link.rentalId, now), messages: await claimMessages(transaction, access.link.rentalId), repairs: await claimRepairs(transaction, access.link.rentalId) }))
  // The renter's own assistant may argue the contest while it is connected; its name is its own, not verified.
  const assistantName = loaded.assistant?.connected === true ? (loaded.assistant.clientLabel === '' ? (await getTranslations('renter.assistant'))('unnamed') : loaded.assistant.clientLabel) : null
  const data = loaded.workspace
  if (data?.claim == null || loaded.rental === undefined || ['draft', 'awaiting_approval'].includes(data.claim.state)) return <LinkRefused failure="link_invalid" />
  const display = (key: string | null) => key === null || evidence === undefined ? Promise.resolve(null) : evidence.displayLink(key)
  // A line the shop repaired, once its repair was closed: the renter who paid sees it (architecture.md section 9.6).
  const repairOf = async (lineId: string) => {
    const repaired = loaded.repairs.find((each) => each.claimLineId === lineId && each.outcome === 'repaired' && each.repairedAt !== null)
    return repaired?.repairedAt == null ? null : { repairedAt: repaired.repairedAt, url: await display(repaired.displayKey) }
  }
  const lines = await Promise.all(data.lines.map(async (line) => ({ id: line.id, description: line.description, reason: line.reason ?? line.findingDescription ?? '', amountCents: line.amountCents, actorName: line.actorName, beforeUrl: await display(line.beforeKey), afterUrl: await display(line.afterKey), region: line.region, repair: await repairOf(line.id) })))
  const canReply = access.link.scopes.includes('accept') && access.link.scopes.includes('contest') && claimReplyAllowed(data.claim.state, data.claim.replyDueAt, now, data.protectedReply, data.replies.length > 0)
  return <RenterClaimScreen token={token} data={{ shopName: loaded.rental.shopName, currency: data.currency, state: data.claim.state, totalCents: data.claim.totalCents, captureCents: data.amounts.capture.cents, releaseCents: data.amounts.release.cents, invoiceCents: data.amounts.invoice.cents, replyDueAt: data.claim.replyDueAt, holdState: data.holdState, pendingSettlement: data.execution !== null && ['pending', 'submitted'].includes(data.execution.state), canAcknowledge: data.claim.state === 'approved' && access.link.scopes.includes('accept'), canReply, canAdvocate: canReply && data.claim.state === 'presented' && loaded.negotiation === undefined, assistantName, negotiation: loaded.negotiation !== undefined, lines, timeZone: loaded.rental.timeZone, contest: loaded.contest, promise: loaded.promise ?? null, messages: loaded.messages, canWrite: access.link.scopes.includes('contest') && data.claim.state !== 'closed', now }} />
}
