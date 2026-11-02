import { DECLARED_PHOTO_SOURCES, INCIDENT_HINTS, INCIDENT_LIMITS, INCIDENT_STATES, MAX_PHOTO_BYTES, MISSED_VIEWS } from '@hold/domain'
import { z } from 'zod'
import { pushRegistration, pushTokenSchema } from './push'
import { RETURN_TO } from './renter-paypal'

// What a renter may do, as the phone app and the web app's server both check it (architecture.md section 13.8). Each
// input is the form the renter's link sends, without the token and the language, which travel beside it. Each output
// is what the phone is told back. No input names an amount the server trusts: a fee, a hold and an extension are
// priced by Hold and approved in PayPal; the one amount a renter writes is the highest total they would pay through an
// advocate, which code bounds (extensions.md section 9.4).

const code = z.string().regex(/^[0-9]{8}$/)
// Where a one-time code goes: the way the renter chose to be reached (a confirmed phone, or email), or email when asked.
export const codeVia = z.enum(['chosen', 'email']).default('chosen')
const orderId = z.string().min(1).max(64)
const sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const bytes = z.coerce.number().int().min(1).max(MAX_PHOTO_BYTES)
const planView = z.string().min(1).max(80).regex(/^[a-z0-9-]+$/)
const fraction = z.coerce.number().min(0).max(1)
const theftField = z.string().trim().max(300)
// What the phone measured of a photograph before it uploaded it (architecture.md section 9.4).
const measures = { sharpness: z.coerce.number().min(0).max(1_000_000), shadows: z.coerce.number().min(0).max(255), highlights: z.coerce.number().min(0).max(255), filled: fraction }
// The live camera or a chosen file, as the capture screen reports it. Optional, so an older phone still uploads.
const uploaded = { key: z.string().min(1).max(300), ...measures, source: z.enum(DECLARED_PHOTO_SOURCES).optional() }

// An amount in whole units with at most two decimals. It becomes cents by the currency's rules where it is used.
export const amountText = z.string().trim().regex(/^\d{1,7}(?:[.,]\d{1,2})?$/)

// Where PayPal sends the renter after its approval page (renter-paypal.ts). The web page, unless the app says so.
const returnTo = { returnTo: z.enum(RETURN_TO).optional() }

const nothing = z.object({})
const started = z.object({ approvalUrl: z.url(), orderId: z.string(), returnUrl: z.url() })
const uploadLink = z.object({ key: z.string(), url: z.url(), headers: z.record(z.string(), z.string()) })
const photo = z.object({ photoId: z.string() })
// Where the code went, for the screen to say: by text to the masked number, or by email. In a demo shop the text is
// shown instead of sent, and `shown` holds its words.
const codeSent = z.object({ via: z.enum(['text', 'email']), phone: z.string().nullable(), sandboxContact: z.boolean(), shown: z.string().nullable() })

const action = <Input extends z.ZodRawShape, Output extends z.ZodType>(input: Input, output: Output) => ({ input: z.strictObject(input), output })

export const renterActions = {
  // The rental fee and the hold at pickup, each approved in PayPal and then confirmed, which reads the order back.
  'pay-fee': action(returnTo, started),
  'confirm-fee': action({ orderId }, z.object({ state: z.enum(['booked', 'capturing']) })),
  'approve-hold': action(returnTo, started),
  'confirm-hold': action({ orderId }, z.object({ state: z.enum(['placed', 'placing']) })),

  // The condition report sent at handover: confirm it, or add photographs of what staff missed.
  'confirm-condition': action({}, nothing),
  'request-missed-upload': action({ itemId: z.uuid(), view: z.enum(MISSED_VIEWS), sha256, bytes }, uploadLink),
  'confirm-missed-upload': action({ itemId: z.uuid(), view: z.enum(MISSED_VIEWS), ...uploaded }, photo),
  'send-missed': action({}, nothing),

  // More days, priced by Hold and paid in PayPal.
  'ask-extension': action({ endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) }, z.object({ extraDays: z.number().int(), feeCents: z.number().int(), currency: z.string(), endsAt: z.string() })),
  'pay-extension': action(returnTo, started),
  'confirm-extension': action({ orderId }, z.object({ state: z.enum(['paid', 'capturing', 'reviewing']) })),

  // Something happened during the rental (extensions.md section 10). Agreeing a price takes a one-time code.
  'report-incident': action({ itemId: z.uuid(), hint: z.enum(INCIDENT_HINTS), description: z.string().trim().min(1).max(INCIDENT_LIMITS.descriptionLength) }, z.object({ incidentId: z.string() })),
  'request-incident-upload': action({ incidentId: z.uuid(), view: planView, sha256, bytes }, uploadLink),
  'confirm-incident-upload': action({ incidentId: z.uuid(), view: planView, ...uploaded }, photo),
  // The box is optional: a theft has nothing to box. When given, all of it is given.
  'send-incident-report': action({ incidentId: z.uuid(), view: z.string().max(80).optional(), x: fraction.optional(), y: fraction.optional(), width: fraction.optional(), height: fraction.optional() }, z.object({ state: z.enum(INCIDENT_STATES) })),
  'send-incident-code': action({ incidentId: z.uuid(), via: codeVia }, codeSent),
  'agree-incident-price': action({ incidentId: z.uuid(), code }, nothing),
  'leave-incident-to-return': action({ incidentId: z.uuid() }, nothing),
  'give-theft-details': action({ incidentId: z.uuid(), where: theftField.min(1), when: theftField.min(1), lockAndKeys: theftField.min(1), policeReport: theftField.optional() }, nothing),
  'give-police-report': action({ incidentId: z.uuid(), policeReport: theftField.min(1) }, nothing),

  // Returning the item with nobody at the counter (architecture.md section 6.13).
  'start-self-return': action({}, z.object({ sessionIds: z.array(z.string()) })),
  'request-self-return-upload': action({ sessionId: z.uuid(), view: planView, sha256, bytes }, uploadLink),
  'confirm-self-return-upload': action({ sessionId: z.uuid(), view: planView, ...uploaded }, photo),
  'send-self-return': action({}, nothing),

  // The claim: a code to the renter's address, then accept or contest with it, or acknowledge an approved one.
  'send-claim-code': action({ via: codeVia }, codeSent),
  'accept-claim': action({ code, comment: z.string().trim().max(1000).optional() }, nothing),
  'contest-claim': action({ code, comment: z.string().trim().max(1000).optional() }, nothing),
  'acknowledge-claim': action({}, nothing),
  'write-to-shop': action({ body: z.string().max(1000) }, nothing),

  // An advocate argues the contest; the renter confirms what the advocates agreed with a fresh code.
  // Who argues it: Hold's advocate, or the renter's own assistant connected to this rental (extensions.md 9.11).
  'start-advocate': action({ code, highest: amountText, comment: z.string().trim().max(1000).optional(), advocate: z.enum(['hold', 'assistant']).optional() }, z.object({ kind: z.enum(['negotiation', 'reply']) })),
  'send-settlement-code': action({ via: codeVia }, codeSent),
  'confirm-settlement': action({ code, decision: z.enum(['confirm', 'decline']) }, nothing),
  'stop-advocate': action({}, nothing),

  // How Hold reaches the renter (architecture.md section 12.3): by email, or by text to a number confirmed with a code.
  // Once the hold is placed a new number needs changeCode, the code first sent where the renter's codes go now.
  'send-phone-code': action({ phone: z.string().trim().max(40), changeCode: z.union([z.literal(''), code]) }, z.object({ phone: z.string(), confirmed: z.boolean(), shown: z.string().nullable() })),
  'confirm-phone': action({ code }, z.object({ phone: z.string() })),
  'choose-email': action({}, z.object({ channel: z.literal('email') })),
  'send-contact-change-code': action({}, codeSent),

  // The Clean Record (extensions.md section 7.6), each change proven by a one-time code.
  'send-trust-code': action({ via: codeVia }, codeSent),
  'answer-consent': action({ code, consent: z.enum(['yes', 'no']) }, z.object({ consented: z.boolean() })),
  'delete-record': action({ code, understood: z.literal('yes') }, z.object({ removed: z.number().int() })),

  // The renter's own assistant, and the rental's record.
  'disconnect-assistant': action({}, nothing),
  'build-renter-record': action({}, z.object({ packId: z.string() })),
  'download-renter-record': action({ packId: z.uuid(), kind: z.enum(['pdf', 'manifest']) }, z.object({ url: z.url(), filename: z.string() })),
  // A statement Hold signs about one item's sealed evidence, and the /verify address that checks it in the browser.
  'check-evidence': action({ itemId: z.uuid() }, z.object({ url: z.url() })),

  // Push notifications to this phone for this rental (section 13.9). The language is the request's own.
  'register-push': action(pushRegistration, z.object({ reference: z.string() })),
  'unregister-push': action({ pushToken: pushTokenSchema }, nothing),
}

export type RenterActionName = keyof typeof renterActions
export const RENTER_ACTION_NAMES = Object.keys(renterActions) as RenterActionName[]
export const isRenterActionName = (name: string): name is RenterActionName => Object.hasOwn(renterActions, name)
// What the phone passes: the parsed form, so a number is a number.
export type RenterActionInput<Name extends RenterActionName> = z.output<(typeof renterActions)[Name]['input']>
export type RenterActionOutput<Name extends RenterActionName> = z.output<(typeof renterActions)[Name]['output']>
