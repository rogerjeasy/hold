import { claimCodeRecipient } from './claim-code-recipient.ts'
import type { RentalState } from './rental.ts'

// How Hold reaches a renter (architecture.md section 12.3): by email, or by text message to a phone they confirmed.
// The renter chooses. A tourist at the counter may have only their phone with them.

export const CONTACT_CHANNELS = ['email', 'text'] as const
export type ContactChannel = (typeof CONTACT_CHANNELS)[number]

// The rules for the code that confirms a phone are the money codes' own: eight digits, ten minutes, three tries, and
// another only after a minute.
export const PHONE_CODE = { minutes: 10, attempts: 3, resendSeconds: 60 } as const

// What a text was for, and what became of it. A demo shop shows its texts on screen instead of sending them.
export const TEXT_PURPOSES = ['renter_link', 'condition_link', 'drop_off', 'shop_message', 'renter_code', 'phone_code', 'reminder', 'hold_renewal', 'promise_missed', 'receipt'] as const
export type TextPurpose = (typeof TEXT_PURPOSES)[number]
export const TEXT_STATUSES = ['sent', 'delivered', 'failed', 'opted_out', 'simulated'] as const
export type TextStatus = (typeof TEXT_STATUSES)[number]

// At most this many texts a day to one rental, one number and one shop, so nobody can run up the shop's bill by asking.
export const TEXT_LIMITS = { perRentalPerDay: 12, perNumberPerDay: 12, perShopPerDay: 400 } as const

// The one account every email leaves through, which also carries Cognito's sign-in codes: about this many a day, and
// the share of it kept for those codes and the worker's reminders, which no request can spend.
export const SENDING_ACCOUNT = { perDay: 500, signInHeadroom: 100 } as const

// At most this many emails a day that someone asked Hold to send, so the public demo never becomes a relay and no
// tenant can stop another shop's renter getting what they need. Every email counts per rental, per address in its shop
// and per shop. Then each falls into one of three pools that never overlap, which together leave the sign-in codes
// their room: all demo mail, essential included (demoPerDay); real shops' essential mail, which a renter needs to act
// on their own money (shopsEssentialPerDay), reserved so no demo can touch it; and real shops' discretionary mail
// (shopsDiscretionaryPerDay). A demo's essential mail also counts per caller's network, and all demo mail per address
// across demos, so one visitor can neither take the demos' day nor bomb one address from many demos. All discretionary
// mail also counts per address across every shop. A real shop's essential mail to its own renter counts against
// nothing another shop sends. A judge's demo in full sends about fifteen, so none of these is met in normal use.
export const EMAIL_LIMITS = {
  perRentalPerDay: 15,
  perAddressPerShopPerDay: 30,
  perShopPerDay: 60,
  demoEssentialPerNetworkPerDay: 40,
  demoPerAddressPerDay: 40,
  discretionaryPerAddressPerDay: 20,
  demoPerDay: 200,
  shopsEssentialPerDay: 100,
  shopsDiscretionaryPerDay: 100,
} as const

// The messages a renter needs to act on their own money: the link to their rental, the condition report they answer,
// and their one-time codes. Everything else Hold emails is discretionary.
const ESSENTIAL_EMAIL_PURPOSES: ReadonlySet<TextPurpose> = new Set(['renter_link', 'condition_link', 'renter_code', 'phone_code'])
export function emailIsEssential(purpose: TextPurpose): boolean {
  return ESSENTIAL_EMAIL_PURPOSES.has(purpose)
}

// The countries Hold texts, by region, with their calling codes: Europe, North America, Australia, New Zealand and
// Japan. A number anywhere else is reached by email, which keeps premium-rate and high-fraud destinations out of reach.
const TEXT_COUNTRIES: Readonly<Record<string, string>> = {
  US: '1', CA: '1', GR: '30', NL: '31', BE: '32', FR: '33', ES: '34', PT: '351', LU: '352', IE: '353', IS: '354', MT: '356',
  CY: '357', FI: '358', BG: '359', HU: '36', LT: '370', LV: '371', EE: '372', HR: '385', SI: '386', IT: '39', RO: '40',
  CH: '41', CZ: '420', SK: '421', LI: '423', AT: '43', GB: '44', DK: '45', SE: '46', NO: '47', PL: '48', DE: '49',
  AU: '61', NZ: '64', JP: '81',
}
const TEXT_CALLING_CODES = [...new Set(Object.values(TEXT_COUNTRIES))]

// The calling code a number typed on a phone set to this region starts with, when Hold texts there.
export function callingCodeFor(region: string): string | undefined {
  return TEXT_COUNTRIES[region.toUpperCase()]
}

// The international form, + and 8 to 15 digits, from what was typed with any spaces, dots, dashes or brackets. A
// number written with 00 in front of its country code is read as +. Without a country code it is refused.
export function phoneNumber(typed: string): string | undefined {
  const compact = typed.replaceAll(/[\s.\-()]/g, '')
  const international = compact.startsWith('00') ? `+${compact.slice(2)}` : compact
  return /^\+[1-9][0-9]{7,14}$/.test(international) ? international : undefined
}

// +1 is shared by the United States and Canada with the Caribbean and the US territories, whose numbers are the usual
// targets of texting fraud. Their area codes are refused, so +1 reaches the two countries Hold texts and no other.
const NORTH_AMERICA_ELSEWHERE = new Set([
  '242', '246', '264', '268', '284', '340', '345', '441', '473', '649', '658', '664', '670', '671', '684', '721', '758',
  '767', '784', '787', '809', '829', '849', '868', '869', '876', '939',
])

export function textAllowed(phone: string): boolean {
  if (phone.startsWith('+1')) return phone.length === 12 && !NORTH_AMERICA_ELSEWHERE.has(phone.slice(2, 5))
  return TEXT_CALLING_CODES.some((code) => phone.startsWith(`+${code}`))
}

// What staff and logs see of a number: enough to recognise it, never enough to dial it.
export function maskedPhone(phone: string): string {
  return `${phone.slice(0, 3)} ••• •• ${phone.slice(-2)}`
}

export type RenterCodeRecipient = { readonly channel: 'text'; readonly phone: string } | { readonly channel: 'email'; readonly email: string; readonly sandboxContact: boolean }

// A renter's one-time code goes to the phone they confirmed when they chose texts, and otherwise, or when they ask for
// it there, to the email PayPal gave for the payer, under that rule's sandbox exception.
export function renterCodeRecipient(input: {
  readonly paypalMode: 'sandbox' | 'live'
  readonly payerEmail: string
  readonly contactEmail: string | null
  readonly channel: ContactChannel
  readonly phone: string | null
  readonly phoneConfirmed: boolean
  readonly via: 'chosen' | 'email'
}): RenterCodeRecipient {
  if (input.via === 'chosen' && input.channel === 'text' && input.phone !== null && input.phoneConfirmed) return { channel: 'text', phone: input.phone }
  return { channel: 'email', ...claimCodeRecipient(input) }
}

// Until the hold is placed, the renter sets their number freely: at the counter, on their own phone, in the same visit
// as the PayPal approval. Once it is placed, a new number needs a code from the channel trusted now, so whoever has
// only the link cannot point the codes at their own phone.
const FREE_STATES: readonly RentalState[] = ['pending_payment', 'booked', 'awaiting_hold']
export function contactChangeNeedsCode(state: RentalState): boolean {
  return !FREE_STATES.includes(state)
}
