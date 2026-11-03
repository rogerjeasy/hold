import 'server-only'
import { shopSettings } from '@hold/db'
import { maskedPhone } from '@hold/domain'
import type { RenterCodeRecipient } from '@hold/domain'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { Refusal } from './action'
import type { InLinkShop } from './renter-access'
import { tellPayerOfPhone } from './decision-copy'
import { codeLine, reachRenterIn } from './renter-reach'

// Where a renter's one-time code went, for the page to say (architecture.md section 12.3): by text, to the masked
// number, or by email. In a demo shop the text is shown on the page instead of sent, and `shown` holds its words.
export type CodeDelivery = { readonly via: 'text' | 'email'; readonly phone: string | null; readonly sandboxContact: boolean; readonly shown: string | null }

// What a code is for, which its text says, so a renter never types a code without knowing what it agrees to.
export type CodeKind = 'claimReply' | 'settlement' | 'incident' | 'trust' | 'phone' | 'contactChange'
type EmailWords = 'emails.claimCode' | 'emails.incidentCode' | 'emails.trustCode' | 'emails.contactChangeCode'

// Sends a code where it was addressed: the confirmed phone, the phone being confirmed, or the email PayPal gave. The
// text names the shop and the purpose, and ends with the line that lets the phone offer it on Hold's own site. A text
// that cannot go is refused, so the page can offer email instead; it is never sent somewhere the renter did not choose.
export async function deliverRenterCode(inLinkShop: InLinkShop, link: { readonly shopId: string; readonly rentalId: string }, to: RenterCodeRecipient, input: { readonly locale: Locale; readonly code: string; readonly kind: CodeKind; readonly emailWords?: EmailWords }): Promise<CodeDelivery | Refusal> {
  const texts = await getTranslations({ locale: input.locale, namespace: 'texts.codes' })
  const emails = input.emailWords === undefined ? undefined : await getTranslations({ locale: input.locale, namespace: input.emailWords })
  // The payer hears which number their codes go to before the first code goes there.
  if (to.channel === 'text' && input.kind !== 'phone') await tellPayerOfPhone(inLinkShop, link, input.locale)
  return inLinkShop(async (transaction) => {
    const shop = await shopSettings(transaction, link.shopId)
    const text = `${texts(input.kind, { shop: shop?.name ?? '', code: input.code })}\n\n${await codeLine(input.code)}`
    const email = to.channel === 'email' && emails !== undefined ? { to: to.email, subject: emails('subject'), text: emails('body', { code: input.code }) } : null
    const reached = await reachRenterIn(transaction, link.rentalId, () => ({ purpose: input.kind === 'phone' ? 'phone_code' : 'renter_code', email, text }), to)
    // A code held by the day's email allowance reads as one that could not be sent: the renter tries again later.
    if (reached === undefined || reached.via === 'none') return new Refusal(to.channel === 'text' && reached?.emailHeld !== true ? 'text_unavailable' : 'email_unavailable')
    return {
      via: reached.via === 'text' ? 'text' : 'email',
      phone: reached.via === 'text' && to.channel === 'text' ? maskedPhone(to.phone) : null,
      sandboxContact: to.channel === 'email' && to.sandboxContact,
      shown: reached.simulated ? text : null,
    }
  })
}
