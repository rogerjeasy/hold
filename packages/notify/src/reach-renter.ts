import { PUSH_FOR_TEXT, textAllowed } from '@hold/domain'
import type { ContactChannel, RenterPushEvent, TextPurpose, TextStatus } from '@hold/domain'
import type { Email, Mailer } from './mailer.ts'
import type { Texter } from './texter.ts'

// The one way Hold reaches a renter (architecture.md section 12.3), from the web app and the worker alike: a text when
// they chose texts, an email otherwise or when the text cannot go. A demo shop shows the text on the renter's page
// instead of sending it. Each text is recorded, without its words unless it was only shown. Beside the text or email,
// a notice (never a code, never the link itself) is pushed to the phones that registered for this rental in Hold's app.

export type ReachTarget = { readonly shopId: string; readonly rentalId: string; readonly channel: ContactChannel; readonly phone: string | null; readonly simulated: boolean }

// `email` is null for a message only a phone may take: the code that confirms the phone.
export type RenterMessage = { readonly purpose: TextPurpose; readonly email: Email | null; readonly text: string }

export type TextRecord = { readonly rentalId: string; readonly purpose: TextPurpose; readonly toPhone: string; readonly status: TextStatus; readonly providerMessageId: string | null; readonly body: string | null; readonly failure: string | null }

export type ReachDependencies = {
  readonly mailer: Mailer
  readonly texter: Texter
  readonly recordText: (record: TextRecord) => Promise<void>
  // False once the day's texts to this rental, this number or this shop are spent.
  readonly allowText: (target: { readonly shopId: string; readonly rentalId: string; readonly phone: string }) => Promise<boolean>
  // The number replied STOP: the rental goes back to email.
  readonly stopTexts: (rentalId: string) => Promise<void>
  // Pushes the event to the rental's registered phones (architecture.md section 13.9). Absent, nothing is pushed.
  readonly push?: (event: RenterPushEvent) => Promise<void>
}

export type Reached = { readonly via: 'text' | 'email' | 'none'; readonly simulated: boolean; readonly fellBack: 'limit' | 'unavailable' | 'opted_out' | 'country' | null }

export async function reachRenter(dependencies: ReachDependencies, target: ReachTarget, message: RenterMessage): Promise<Reached> {
  const reached = await byChoice(dependencies, target, message)
  const event = PUSH_FOR_TEXT[message.purpose]
  if (event !== undefined && dependencies.push !== undefined) {
    // A push is extra: its failure never changes how the renter was reached, nor fails the work that reached them.
    try {
      await dependencies.push(event)
    } catch (error) {
      console.warn(JSON.stringify({ event: 'push_failed', error: error instanceof Error ? error.name : 'unknown' }))
    }
  }
  return reached
}

async function byChoice(dependencies: ReachDependencies, target: ReachTarget, message: RenterMessage): Promise<Reached> {
  if (target.channel === 'email') return byEmail(dependencies, message, null)
  const phone = target.phone
  if (phone === null || !textAllowed(phone)) return byEmail(dependencies, message, 'country')
  if (!(await dependencies.allowText({ shopId: target.shopId, rentalId: target.rentalId, phone }))) return byEmail(dependencies, message, 'limit')
  const record = { rentalId: target.rentalId, purpose: message.purpose, toPhone: phone }
  if (target.simulated) {
    await dependencies.recordText({ ...record, status: 'simulated', providerMessageId: null, body: message.text, failure: null })
    return { via: 'text', simulated: true, fellBack: null }
  }
  const sent = await dependencies.texter.send({ to: phone, body: message.text, context: { shopId: target.shopId, rentalId: target.rentalId } })
  if (sent.ok) {
    await dependencies.recordText({ ...record, status: 'sent', providerMessageId: sent.messageId, body: null, failure: null })
    return { via: 'text', simulated: false, fellBack: null }
  }
  await dependencies.recordText({ ...record, status: sent.reason === 'opted_out' ? 'opted_out' : 'failed', providerMessageId: null, body: null, failure: sent.reason })
  if (sent.reason === 'opted_out') await dependencies.stopTexts(target.rentalId)
  return byEmail(dependencies, message, sent.reason)
}

async function byEmail(dependencies: ReachDependencies, message: RenterMessage, fellBack: Reached['fellBack']): Promise<Reached> {
  const sent = message.email !== null && (await dependencies.mailer.send(message.email))
  return { via: sent ? 'email' : 'none', simulated: false, fellBack }
}
