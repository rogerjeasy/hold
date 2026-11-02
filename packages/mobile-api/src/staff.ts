import { DECLARED_PHOTO_SOURCES } from '@hold/domain'
import { z } from 'zod'
import { answerSchema } from './envelope'
import type { Failed } from './envelope'
import { list, withLocale } from './form'
import { pushRegistration, pushTokenSchema } from './push'

// The staff half of the phone's HTTP contract (architecture.md section 13.7): signing in, the quick actions of the
// counter and what the phone reads to do them. The web app's /api/mobile/v1 routes and the phone validate with these
// same schemas. Money decisions are not here: approving, capturing and releasing need a passkey, on the web.

export const MOBILE_API_BASE = '/api/mobile/v1'
// The shop the phone is working in. A bearer request names it every time; one the person has no role in is refused.
export const SHOP_HEADER = 'x-hold-shop'

const instant = z.iso.datetime({ offset: true })
const cents = z.number().int()

// ---- Signing in ----

export const signInStartInput = z.strictObject({ email: z.string().max(254), locale: z.string().max(5) })
// The attempt is sealed by the server: the phone keeps it between the two steps and cannot read or change it.
export const signInStartedSchema = z.object({ attempt: z.string(), expiresAt: instant })
export const signInVerifyInput = z.strictObject({ attempt: z.string().min(1).max(4096), code: z.string().max(20) })
export const staffTokensSchema = z.object({ accessToken: z.string(), refreshToken: z.string(), expiresInSeconds: z.number().int() })
export const refreshInput = z.strictObject({ refreshToken: z.string().min(1).max(8192) })
export const refreshedSchema = z.object({ accessToken: z.string(), expiresInSeconds: z.number().int() })
// The phone's push token, when it registered one, so its registration ends with the session (section 13.9).
export const signOutInput = refreshInput.extend({ pushToken: pushTokenSchema.optional() })
// One tap for judges: a fresh demo, or the one this phone started, sealed by the server with both accounts' passwords.
export const demoStartInput = z.strictObject({ account: z.enum(['owner', 'staff']), demo: z.string().min(1).max(4096).optional() })
export const demoStartedSchema = staffTokensSchema.extend({ demo: z.string(), shopId: z.uuid() })
export const staffRoleSchema = z.enum(['owner', 'manager', 'counter_staff', 'read_only'])
export const meSchema = z.object({ name: z.string().nullable(), email: z.string(), shops: z.array(z.object({ shopId: z.uuid(), name: z.string(), role: staffRoleSchema })) })

// ---- The counter's quick actions ----

const fraction = z.coerce.number().min(0).max(1)
const photoFields = { sessionId: z.uuid(), view: z.string().min(1).max(64) }

export const rentalItemInput = withLocale({ rentalId: z.uuid(), itemId: z.uuid() })
export const sessionInput = withLocale({ sessionId: z.uuid() })
export const rentalInput = withLocale({ rentalId: z.uuid() })
// The largest photograph the evidence store takes is checked by the server, which knows it.
export const photoLinkInput = withLocale({ ...photoFields, sha256: z.string().regex(/^[0-9a-f]{64}$/), bytes: z.coerce.number().int().min(1) })
export const photoRecordInput = withLocale({
  ...photoFields,
  key: z.string().min(1).max(300),
  sharpness: z.coerce.number().min(0).max(1_000_000),
  shadows: z.coerce.number().min(0).max(255),
  highlights: z.coerce.number().min(0).max(255),
  filled: z.coerce.number().min(0).max(1),
  // The live camera or a chosen file, as the capture screen reports it. Optional, so an older phone still uploads.
  source: z.enum(DECLARED_PHOTO_SOURCES).optional(),
})
export const handoverMarkInput = withLocale({ ...photoFields, x: fraction, y: fraction, width: fraction, height: fraction, description: z.string().max(200) })
export const knownMarksInput = withLocale({ sessionId: z.uuid(), markId: list(z.uuid()) })
export const reviewNote = z.strictObject({ outcome: z.enum(['clean', 'findings', 'deferred']), reason: z.string().trim().min(1).max(1000) })
export const reviewInput = withLocale({ comparisonId: z.uuid(), ...reviewNote.shape })
// The domain's ITEM_STATUSES, which this package cannot import; changeItemStatus passes it to code typed by them.
export const itemStatusInput = withLocale({ itemId: z.uuid(), status: z.enum(['in_service', 'in_repair', 'retired']), note: z.string().max(500).default('') })
export const renterMessageInput = withLocale({ rentalId: z.uuid(), body: z.string().max(1000) })

const nothing = z.object({})
const linkShown = z.object({ url: z.url() })

// Every action the phone may ask for, by the name in its address, with what it takes and what it answers. Each runs
// the web app's own server function; the answer is shaped by the output schema on the server.
export const STAFF_ACTIONS = {
  'start-handover': { input: rentalItemInput, output: z.object({ sessionId: z.uuid() }) },
  'request-handover-photo': { input: photoLinkInput, output: z.object({ key: z.string(), url: z.url(), headers: z.record(z.string(), z.string()) }) },
  'record-handover-photo': { input: photoRecordInput, output: z.object({ photoId: z.uuid() }) },
  'add-handover-mark': { input: handoverMarkInput, output: z.object({ markId: z.uuid() }) },
  'confirm-known-marks': { input: knownMarksInput, output: nothing },
  // The condition report's link, shown as a code once every item is handed over.
  'seal-handover': { input: sessionInput, output: z.object({ rentalOut: z.boolean(), conditionLink: linkShown.extend({ sent: z.enum(['text', 'email']).nullable() }).optional() }) },
  'start-return': { input: rentalItemInput, output: z.object({ sessionId: z.uuid() }) },
  'request-return-photo': { input: photoLinkInput, output: z.object({ key: z.string(), url: z.url(), headers: z.record(z.string(), z.string()) }) },
  'record-return-photo': { input: photoRecordInput, output: z.object({ photoId: z.uuid() }) },
  'seal-return': { input: sessionInput, output: z.object({ rentalId: z.uuid(), rentalReturned: z.boolean(), comparisonId: z.uuid().nullable() }) },
  'record-review': { input: reviewInput, output: nothing },
  'confirm-drop-off': { input: rentalInput, output: z.object({ rentalId: z.uuid() }) },
  'report-drop-off-missing': { input: rentalInput, output: z.object({ emailed: z.boolean() }) },
  // A new link for the renter to scan; the phone draws the code from the address.
  'show-renter-link': { input: rentalInput, output: linkShown },
  // A new link, sent the way the renter is reached: by text to the masked number, or by email.
  'send-renter-link': { input: rentalInput, output: z.object({ via: z.enum(['text', 'email']), to: z.string() }) },
  // Asking moves no money: the renter approves the hold in PayPal on their own phone, from this link.
  'ask-for-hold': { input: rentalInput, output: linkShown },
  'change-item-status': { input: itemStatusInput, output: nothing },
  'write-to-renter': { input: renterMessageInput, output: z.object({ rentalId: z.uuid(), body: z.string() }) },
  // Push notifications to this phone for the signed-in person in this shop (section 13.9).
  'register-push': { input: withLocale(pushRegistration), output: nothing },
  'unregister-push': { input: withLocale({ pushToken: pushTokenSchema }), output: nothing },
} as const satisfies Record<string, { readonly input: z.ZodType; readonly output: z.ZodType }>

export type StaffActionName = keyof typeof STAFF_ACTIONS
export const STAFF_ACTION_NAMES = Object.keys(STAFF_ACTIONS) as StaffActionName[]
export type StaffActionInput<Name extends StaffActionName> = Omit<z.input<(typeof STAFF_ACTIONS)[Name]['input']>, 'locale'>
export type StaffActionOutput<Name extends StaffActionName> = z.infer<(typeof STAFF_ACTIONS)[Name]['output']>

// ---- What the phone reads ----

const holdSchema = z.object({ state: z.string(), reservedCents: cents, currency: z.string(), assuredUntil: instant.nullable(), validUntil: instant.nullable() })

export const todaySchema = z.object({
  shop: z.object({ id: z.uuid(), name: z.string(), timeZone: z.string(), currency: z.string().nullable() }),
  role: staffRoleSchema,
  // What goes out and comes back today, in the order of the day.
  counter: z.array(
    z.object({
      rentalId: z.uuid(),
      kind: z.enum(['handover', 'return']),
      at: instant,
      renterName: z.string().nullable(),
      items: z.array(z.string()),
      done: z.boolean(),
      hold: z.object({ state: z.string(), reservedCents: cents }).nullable(),
      simulated: z.boolean(),
    }),
  ),
  // Items renters left at the drop point that nobody has checked yet.
  dropOffs: z.array(z.object({ rentalId: z.uuid(), renterName: z.string().nullable(), droppedOffAt: instant, simulated: z.boolean() })),
  // Claims and holds that wait on a person. They are decided on the web, where a passkey confirms the person.
  decisions: z.object({ waiting: z.number().int(), decidedOn: z.literal('web') }),
})

export const rentalSummarySchema = z.object({
  id: z.uuid(),
  state: z.string(),
  startsAt: instant,
  endsAt: instant,
  who: z.string().nullable(),
  items: z.array(z.string()),
  feeCents: cents,
  holdCents: cents,
  currency: z.string(),
  simulated: z.boolean(),
})
export const rentalsSchema = z.object({ rentals: z.array(rentalSummarySchema) })
export const rentalsQuery = z.strictObject({ q: z.string().trim().max(100).optional() })

export const rentalViewSchema = rentalSummarySchema.omit({ items: true }).extend({
  // Left out for a read-only member, who has no use for the renter's address.
  contactEmail: z.string().nullable().optional(),
  language: z.string(),
  hold: holdSchema.nullable(),
  items: z.array(
    z.object({
      id: z.uuid(),
      label: z.string(),
      typeName: z.string(),
      handover: z.object({ sessionId: z.uuid(), sealed: z.boolean() }).nullable(),
      return: z.object({ sessionId: z.uuid(), sealed: z.boolean(), comparisonId: z.uuid().nullable() }).nullable(),
    }),
  ),
  dropOff: z.object({ droppedOffAt: instant, missingAt: instant.nullable() }).nullable(),
  // Whether this person may act at the counter: show or email the renter's link, ask for the hold, photograph.
  canAct: z.boolean(),
})

const regionSchema = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
const shownPhoto = z.object({ view: z.string(), url: z.string().nullable(), simulated: z.boolean() })

export const captureSessionSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['handover', 'return']),
  rentalId: z.uuid(),
  itemLabel: z.string(),
  sealed: z.boolean(),
  plan: z.array(z.object({ key: z.string(), label: z.string(), outline: z.string(), required: z.boolean() })),
  photos: z.array(shownPhoto),
  marks: z.array(z.object({ id: z.uuid(), view: z.string(), region: regionSchema, description: z.string(), confirmed: z.boolean(), new: z.boolean() })),
  missing: z.array(z.string()),
  // For a return, the sealed handover's photograph of each view, shown faintly over the camera to match the angle.
  ghost: z.array(shownPhoto),
  canAct: z.boolean(),
})

export type StaffTokens = z.infer<typeof staffTokensSchema>
export type Me = z.infer<typeof meSchema>
export type Today = z.infer<typeof todaySchema>
export type RentalSummary = z.infer<typeof rentalSummarySchema>
export type RentalView = z.infer<typeof rentalViewSchema>
export type CaptureSessionView = z.infer<typeof captureSessionSchema>

// ---- Typed clients ----

export type Answer<Value> = { readonly ok: true; readonly value: Value } | Failed
type Fetch = (input: string, init?: RequestInit) => Promise<Response>

async function ask<Value extends z.ZodType>(fetcher: Fetch, url: string, init: RequestInit, value: Value): Promise<Answer<z.infer<Value>>> {
  const response = await fetcher(url, init)
  return answerSchema(value).parse(await response.json()) as Answer<z.infer<Value>>
}

const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

export type StaffSessionClientOptions = { readonly baseUrl: string; readonly fetch: Fetch }

// Signing in, before any shop: an emailed code in two steps, a refresh, signing out, and the judges' demo.
export function staffSessionApi({ baseUrl, fetch: fetcher }: StaffSessionClientOptions) {
  const at = (path: string) => `${baseUrl}${MOBILE_API_BASE}/session/${path}`
  return {
    start: (input: z.input<typeof signInStartInput>) => ask(fetcher, at('start'), json(input), signInStartedSchema),
    verify: (input: z.input<typeof signInVerifyInput>) => ask(fetcher, at('verify'), json(input), staffTokensSchema),
    refresh: (input: z.input<typeof refreshInput>) => ask(fetcher, at('refresh'), json(input), refreshedSchema),
    signOut: (input: z.input<typeof signOutInput>) => ask(fetcher, at('sign-out'), json(input), z.object({})),
    demo: (input: z.input<typeof demoStartInput>) => ask(fetcher, at('demo'), json(input), demoStartedSchema),
    me: (accessToken: string) => ask(fetcher, at('me'), { method: 'GET', headers: { authorization: `Bearer ${accessToken}` } }, meSchema),
  }
}

export type StaffClientOptions = StaffSessionClientOptions & { readonly accessToken: string; readonly shopId: string; readonly locale: string }

// Everything the phone does in one shop, as one signed-in person.
export function staffApi({ baseUrl, fetch: fetcher, accessToken, shopId, locale }: StaffClientOptions) {
  const headers = { authorization: `Bearer ${accessToken}`, [SHOP_HEADER]: shopId }
  const at = (path: string) => `${baseUrl}${MOBILE_API_BASE}/shop/${path}`
  const read = <Value extends z.ZodType>(path: string, value: Value) => ask(fetcher, at(path), { method: 'GET', headers }, value)
  return {
    today: () => read('today', todaySchema),
    rentals: (query: z.input<typeof rentalsQuery> = {}) => read(query.q === undefined || query.q === '' ? 'rentals' : `rentals?q=${encodeURIComponent(query.q)}`, rentalsSchema),
    rental: (rentalId: string) => read(`rentals/${encodeURIComponent(rentalId)}`, rentalViewSchema),
    session: (sessionId: string) => read(`sessions/${encodeURIComponent(sessionId)}`, captureSessionSchema),
    act: <Name extends StaffActionName>(name: Name, input: StaffActionInput<Name>) => ask(fetcher, at(`actions/${name}`), json({ ...input, locale }, headers), STAFF_ACTIONS[name].output) as Promise<Answer<StaffActionOutput<Name>>>,
  }
}
