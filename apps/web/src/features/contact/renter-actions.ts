'use server'
import { chooseEmail as chooseRenterEmail, confirmPhone as confirmRenterPhone, issueContactChangeCode, requestPhoneCode, useClaimCode } from '@hold/db'
import { maskedPhone, phoneNumber, textAllowed } from '@hold/domain'
import { readLocale } from '@/features/auth/locale-input'
import { Refusal } from '@/server/action'
import { tellPayerOfPhone } from '@/server/decision-copy'
import { deliverRenterCode } from '@/server/renter-code-delivery'
import { renterAction, renterInput } from '@/server/renter-access'
import { newRenterCode, renterCodeDigest } from '@/server/renter-code'

// How a renter is reached (architecture.md section 12.3), chosen on their own phone through any of their links. Until
// the hold is placed they set their number freely; after, a new number needs the code sent to the channel trusted now.
// Nothing here moves money.

// The phone code is kept on the rental, so it is bound to the rental rather than to the link it was asked through.
const phoneDigest = (rentalId: string, code: string) => renterCodeDigest('phone-confirm', rentalId, code)
const changeDigest = (linkId: string, code: string) => renterCodeDigest('contact-change', linkId, code)

export const sendPhoneCode = renterAction(
  { name: 'renter.phone_code_requested', scope: 'view', input: renterInput('send-phone-code') },
  async (link, input, inLinkShop) => {
    // Checked before a change code is spent, so a mistyped number never costs the renter their code.
    const phone = phoneNumber(input.phone)
    if (phone === undefined) return new Refusal('phone_invalid')
    if (!textAllowed(phone)) return new Refusal('country_not_texted')
    const code = await newRenterCode()
    const hash = await phoneDigest(link.rentalId, code)
    const requested = await inLinkShop(async (transaction) => {
      if (input.changeCode !== '') {
        const verified = await useClaimCode(transaction, link.id, await changeDigest(link.id, input.changeCode), new Date())
        if (!verified.ok) return verified
      }
      return requestPhoneCode(transaction, link.rentalId, { typed: phone, hash, stepUp: input.changeCode !== '' }, new Date())
    })
    if (!requested.ok) return new Refusal(requested.reason)
    if (requested.confirmed) return { phone: maskedPhone(requested.phone), confirmed: true, shown: null }
    const delivered = await deliverRenterCode(inLinkShop, link, { channel: 'text', phone: requested.phone }, { locale: readLocale(input.locale), code, kind: 'phone' })
    if (delivered instanceof Refusal) return delivered
    return { phone: maskedPhone(requested.phone), confirmed: false, shown: delivered.shown }
  },
)

export const confirmPhone = renterAction(
  { name: 'renter.phone_confirmed', scope: 'view', input: renterInput('confirm-phone') },
  async (link, input, inLinkShop) => {
    const hash = await phoneDigest(link.rentalId, input.code)
    const confirmed = await inLinkShop((transaction) => confirmRenterPhone(transaction, link.rentalId, hash, new Date()))
    if (!confirmed.ok) return new Refusal(confirmed.reason)
    await tellPayerOfPhone(inLinkShop, link, readLocale(input.locale))
    return { phone: maskedPhone(confirmed.phone) }
  },
)

export const chooseEmail = renterAction({ name: 'renter.email_chosen', scope: 'view', input: renterInput('choose-email') }, async (link, _input, inLinkShop) => {
  await inLinkShop((transaction) => chooseRenterEmail(transaction, link.rentalId))
  return { channel: 'email' as const }
})

// The first step of a new number once the hold is placed: a code to the channel trusted now.
export const sendContactChangeCode = renterAction({ name: 'renter.contact_change_code_requested', scope: 'view', input: renterInput('send-contact-change-code') }, async (link, input, inLinkShop) => {
  const code = await newRenterCode()
  const issued = await inLinkShop(async (transaction) => issueContactChangeCode(transaction, link.id, await changeDigest(link.id, code), new Date()))
  if (!issued.ok) return new Refusal(issued.reason)
  return deliverRenterCode(inLinkShop, link, issued, { locale: readLocale(input.locale), code, kind: 'contactChange', emailWords: 'emails.contactChangeCode' })
})
