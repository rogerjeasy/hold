import 'server-only'
import { randomBytes } from 'node:crypto'
import { findRenterLink, inShop, issueRenterLink, rentalDetail, rentalHold, renterView } from '@hold/db'
import type { McpPorts } from '@hold/mcp'
import { readLocale } from '@/features/auth/locale-input'
import { Refusal } from './action'
import { startFeePayment } from './fee-payment'
import { startHoldApproval } from './hold-approval'
import { sendNegotiation } from './negotiation-queue'
import { paypalForShop } from './paypal-for-shop'
import { qrPng } from './qr'
import type { InLinkShop } from './renter-access'
import { newRenterLink, renterTokenFingerprint } from './renter-links'
import { getServices } from './services'

// What Hold's MCP server reaches through the app (packages/mcp, ports.ts). The fee and the hold go through the same
// functions a renter's own link uses, so an assistant's booking is paid and its hold approved exactly as any other.

// A link the hold's PayPal order returns the person to: it can view the rental and approve the hold, nothing more.
const HOLD_RETURN_SCOPES = ['view', 'pay']

async function linkOf(token: string) {
  const { database } = await getServices()
  const fingerprint = await renterTokenFingerprint(token)
  return fingerprint === undefined ? undefined : findRenterLink(database, fingerprint)
}

export async function mcpPorts(): Promise<McpPorts> {
  const services = await getServices()
  const { database, config, evidence } = services
  const inLinkShop =
    (shopId: string): InLinkShop =>
    (work) =>
      inShop(database, { role: 'hold_app', shopId }, work)
  return {
    database,
    now: () => new Date(),
    paypalMode: config.paypalMode,
    secret: services.renterLinkKey,
    random: () => randomBytes(32),
    publicUrl: config.publicUrl,
    newRenterLink,
    async startFeePayment({ shopId, renterLinkToken, language }) {
      const link = await linkOf(renterLinkToken)
      if (link === undefined) return { ok: false, reason: 'link_invalid' }
      const started = await startFeePayment(link, inLinkShop(shopId), renterLinkToken, readLocale(language))
      return started instanceof Refusal ? { ok: false, reason: started.reason } : { ok: true, approvalUrl: started.approvalUrl }
    },
    async holdApproval({ shopId, rentalId }) {
      const inThisShop = inLinkShop(shopId)
      const { hold, view } = await inThisShop(async (transaction) => ({ hold: await rentalHold(transaction, rentalId), view: await renterView(transaction, rentalId, new Date()) }))
      if (hold === undefined || view === undefined) return { status: 'not_requested' }
      if (hold.state !== 'requested' && hold.orderId === null) return { status: hold.state === 'placed' ? 'placed' : 'unavailable' }
      const paypal = await inThisShop((transaction) => paypalForShop(transaction, shopId))
      if (paypal === undefined) return { status: 'unavailable' }
      if (hold.orderId !== null) {
        const order = await paypal.readHoldOrder(hold.orderId)
        if (order.ok && order.value.status === 'awaiting_approval' && order.value.approvalUrl !== undefined) return { status: 'awaiting_approval', approvalUrl: order.value.approvalUrl }
      }
      // A new order returns the person to a link of their own, which the assistant never sees.
      const issued = await newRenterLink(view.endsAt)
      await inThisShop((transaction) => issueRenterLink(transaction, shopId, rentalId, issued, HOLD_RETURN_SCOPES))
      const link = await linkOf(issued.token)
      if (link === undefined) return { status: 'unavailable' }
      const rental = await inThisShop((transaction) => rentalDetail(transaction, rentalId, new Date()))
      const started = await startHoldApproval(link, inThisShop, issued.token, readLocale(rental?.language))
      return started instanceof Refusal ? { status: 'unavailable' } : { status: 'awaiting_approval', approvalUrl: started.approvalUrl }
    },
    photoLink: async (key) => (evidence === undefined ? null : evidence.displayLink(key)),
    // The renter's assistant moved and the shop's advocate is next: the same queue Hold's advocates run from.
    sendNegotiation: ({ shopId, rentalId, negotiationId, outboxId }) => sendNegotiation(shopId, rentalId, negotiationId, outboxId),
    qrCode: qrPng,
    // One structured line, with no token, secret or argument text.
    log: (line) => {
      console.info(JSON.stringify(line))
    },
  }
}
