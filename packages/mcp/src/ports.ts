import { inShop } from '@hold/db'
import type { Database, PayPalMode, Transaction } from '@hold/db'

// What Hold's MCP server needs from the app that serves it. PayPal is reached only through these, and none of them
// can capture a hold or move money: the fee and the hold are approved by the person in PayPal's own pages.

export type FeePayment = { readonly ok: true; readonly approvalUrl: string } | { readonly ok: false; readonly reason: string }
export type HoldApproval = { readonly status: 'awaiting_approval'; readonly approvalUrl: string } | { readonly status: 'not_requested' | 'placed' | 'unavailable' }

// A negotiation whose next move is the shop advocate's, after the renter's assistant moved. Its outbox row is
// committed with the move, so a failed send only waits for the relay.
export type NegotiationHandOff = { readonly shopId: string; readonly rentalId: string; readonly negotiationId: string; readonly outboxId: string }

export type McpPorts = {
  readonly database: Database
  readonly now: () => Date
  readonly paypalMode: PayPalMode
  // The secret the agent tokens and booking secrets are signed with, and where their random part comes from.
  readonly secret: Buffer
  readonly random: () => Buffer
  readonly publicUrl: string
  // A renter link to a rental. Its token is used only as the address PayPal returns the person to after approving.
  readonly newRenterLink: (rentalEndsAt: Date) => Promise<{ readonly token: string; readonly fingerprint: string; readonly expiresAt: Date }>
  // The PayPal order for a booking's fee, for the amount stored on the rental. The person approves it in PayPal.
  readonly startFeePayment: (booking: { readonly shopId: string; readonly rentalId: string; readonly renterLinkToken: string; readonly language: string }) => Promise<FeePayment>
  // The PayPal link for the hold at pickup, once staff have asked for it. The person approves it in PayPal.
  readonly holdApproval: (rental: { readonly shopId: string; readonly rentalId: string }) => Promise<HoldApproval>
  // The PayPal order for the extension Hold just quoted, for the amount the quote stored. The person approves it in
  // PayPal, and PayPal returns them to a link of their own (architecture.md section 6.14).
  readonly extensionPayment: (rental: { readonly shopId: string; readonly rentalId: string }) => Promise<{ readonly ok: true; readonly approvalUrl: string } | { readonly ok: false; readonly reason: string }>
  // A short-lived link to a photograph's display copy, or nothing where photographs cannot be shown.
  readonly photoLink: (displayKey: string) => Promise<string | null>
  // Hands the shop's turn to the advocates' worker. It moves no money: the worker only runs the shop's advocate.
  readonly sendNegotiation: (handOff: NegotiationHandOff) => Promise<void>
  // A QR code of a link, as a PNG in base64.
  readonly qrCode: (url: string) => Promise<string>
  // A structured line for the application log, for a call that names no shop and so has no audit log to go to.
  readonly log: (line: Readonly<Record<string, unknown>>) => void
}

// A transaction in one shop with nobody named: the assistant is bound to the shop by the code that resolved it.
export const inShopOf = <Result>(ports: McpPorts, shopId: string, work: (transaction: Transaction) => Promise<Result>) => inShop(ports.database, { role: 'hold_app', shopId }, work)
