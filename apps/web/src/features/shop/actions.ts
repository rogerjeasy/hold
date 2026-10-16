'use server'

import { checkPriceList, isShopCurrency, mayInvite, parseAmount, PRICE_CATEGORIES, STAFF_ROLES } from '@hold/domain'
import { addSampleRentals as addSamples, createInvitation, publishPriceList, revokeInvitation, savePayPalAccount } from '@hold/db'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { readLocale } from '@/features/auth/locale-input'
import { linkRoutes } from '@/lib/routes'
import { subscribeToPayPal } from '@/server/paypal-subscription'
import { getServices } from '@/server/services'
import { list, Refusal, shopAction, withLocale } from '@/server/shop-access'

// Every server function that changes a shop. Each is built by shopAction, which checks who is asking, their role and
// their passkey before the work below runs, and writes the audit line after it. A test checks that this file exports
// nothing else.

export const inviteStaff = shopAction(
  {
    name: 'staff.invited',
    roles: ['owner', 'manager'],
    needsPasskey: true,
    input: withLocale({
      email: z.email().max(254),
      role: z.enum(STAFF_ROLES),
      approvalLimit: z.string().max(20).default(''),
    }),
  },
  async (context, input, transaction) => {
    if (!mayInvite(context.role, input.role)) return new Refusal('role_not_invitable')
    const limitText = input.approvalLimit.trim()
    let approvalLimitCents = 0
    if (limitText !== '' && input.role === 'counter_staff') {
      if (context.shop.currency === null) return new Refusal('currency_unset')
      const limit = parseAmount(limitText, context.shop.currency)
      if (limit === undefined) return new Refusal('limit_invalid')
      approvalLimitCents = limit.cents
    }
    const language = readLocale(input.locale)
    const { token } = await createInvitation(
      transaction,
      { shopId: context.shop.id, invitedByUserId: context.person.userId, email: input.email, role: input.role, approvalLimitCents, language },
      new Date(),
    )
    const { config, mailer } = await getServices()
    const t = await getTranslations({ locale: language, namespace: 'emails.invitation' })
    const roles = await getTranslations({ locale: language, namespace: 'shop.staff.roles' })
    const link = `${config.publicUrl}${language === 'en' ? '' : `/${language}`}${linkRoutes.invite}/${token}`
    const sent = await mailer.send({
      to: input.email,
      subject: t('subject', { shop: context.shop.name }),
      text: t('body', { inviter: context.person.name ?? context.person.email, shop: context.shop.name, role: roles(input.role), link }),
    })
    // Without the email the invitation cannot be accepted, so it is not kept.
    return sent ? { email: input.email.toLowerCase() } : new Refusal('email_failed')
  },
)

export const withdrawInvitation = shopAction(
  { name: 'staff.invitation_revoked', roles: ['owner', 'manager'], needsPasskey: true, input: withLocale({ invitationId: z.uuid() }) },
  async (_context, input, transaction) => ((await revokeInvitation(transaction, input.invitationId, new Date())) ? {} : new Refusal('not_open')),
)

export const publishPrices = shopAction(
  {
    name: 'prices.published',
    roles: ['owner', 'manager'],
    needsPasskey: true,
    input: withLocale({
      currency: z.string().length(3),
      threshold: z.string().max(20).default(''),
      wearPolicy: z.string().max(5000),
      description: list(z.string().max(500)),
      category: list(z.enum(PRICE_CATEGORIES)),
      amount: list(z.string().max(20)),
    }),
  },
  async (context, input, transaction) => {
    if (!isShopCurrency(input.currency)) return new Refusal('currency_unknown')
    const rows = input.description.length
    if (input.category.length !== rows || input.amount.length !== rows) return new Refusal('rows_mismatched')
    const entries = []
    for (let index = 0; index < rows; index += 1) {
      const amount = parseAmount(input.amount[index] ?? '', input.currency)
      if (amount === undefined) return new Refusal(`amount_invalid:${String(index)}`)
      entries.push({ description: input.description[index] ?? '', category: input.category[index] ?? 'damage', amount })
    }
    const thresholdText = input.threshold.trim()
    const threshold = thresholdText === '' ? undefined : parseAmount(thresholdText, input.currency)
    if (thresholdText !== '' && threshold === undefined) return new Refusal('threshold_invalid')
    const draft = { currency: input.currency, entries, wearPolicy: input.wearPolicy }
    const [problem] = checkPriceList(draft)
    if (problem !== undefined) return new Refusal('entry' in problem ? `${problem.kind}:${String(problem.entry)}` : problem.kind)
    const published = await publishPriceList(transaction, context.shop.id, { ...draft, ownerApprovalThreshold: threshold }, new Date())
    return published.ok ? { version: published.version } : new Refusal(published.reason)
  },
)

export const connectPayPal = shopAction(
  {
    name: 'paypal.connected',
    roles: ['owner'],
    needsPasskey: true,
    input: withLocale({ clientId: z.string().trim().min(10).max(200), clientSecret: z.string().trim().min(10).max(200) }),
  },
  async (context, input, transaction) => {
    const { checkPayPalCredentials, paypalCredentials, config } = await getServices()
    const credentials = { clientId: input.clientId, clientSecret: input.clientSecret }
    // Checked with PayPal before anything is kept, so a typo is caught here and not at the first hold.
    const checked = await checkPayPalCredentials(credentials)
    if (checked !== 'accepted') return new Refusal(checked === 'refused' ? 'paypal_refused' : 'paypal_unavailable')
    const reference = await paypalCredentials.save(context.shop.id, config.paypalMode, credentials)
    await savePayPalAccount(transaction, context.shop.id, config.paypalMode, reference)
    return { notifications: await subscribeToPayPal(transaction, context.shop.id) }
  },
)

// Subscribes the shop's webhook address in its PayPal account, for shops that connected before Hold listened.
export const turnOnPayPalNotifications = shopAction(
  { name: 'paypal.notifications_on', roles: ['owner'], needsPasskey: true, input: withLocale({}) },
  async (context, _input, transaction) => ((await subscribeToPayPal(transaction, context.shop.id)) ? {} : new Refusal('notifications_failed')),
)

// A day of sample rentals for a demonstration (architecture.md section 20.3). Every row is marked simulated and moves
// no money. It changes nothing a renter agreed to, so an emailed code is enough; only the owner may do it.
export const addSampleRentals = shopAction(
  { name: 'sample_rentals.added', roles: ['owner'], needsPasskey: false, input: withLocale({}) },
  async (context, _input, transaction) => {
    const added = await addSamples(transaction, { shopId: context.shop.id, userId: context.person.userId, timeZone: context.shop.timeZone, now: new Date() })
    return added.ok ? { rentals: added.rentals } : new Refusal(added.reason)
  },
)
