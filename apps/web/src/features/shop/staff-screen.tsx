import { amountText, money } from '@hold/domain'
import type { StaffRole } from '@hold/domain'
import type { OpenInvitation, StaffMember } from '@hold/db'
import { useFormatter, useTranslations } from 'next-intl'
import { useId } from 'react'
import { InviteForm } from './invite-form'
import { PasskeyGate } from './passkey-gate'
import { ShopFrame } from './shop-frame'
import { WithdrawInvitation } from './withdraw-invitation'

type StaffScreenProps = {
  shopName: string
  currency: string | null
  staff: readonly StaffMember[]
  invitations: readonly OpenInvitation[]
  // The roles this person may invite. Empty for someone who may invite nobody.
  invitableRoles: readonly StaffRole[]
  gate: { needed: boolean; hasPasskey: boolean; email: string }
}

export function StaffScreen({ shopName, currency, staff, invitations, invitableRoles, gate }: StaffScreenProps) {
  const t = useTranslations('shop.staff')
  const roles = useTranslations('shop.staff.roles')
  const format = useFormatter()
  const teamId = useId()
  const openId = useId()
  const inviteId = useId()

  return (
    <ShopFrame shopName={shopName} current="staff" title={t('title')}>
      <div className="grid max-w-prose gap-12">
        <section aria-labelledby={teamId}>
          <h2 id={teamId} className="text-title">
            {t('team')}
          </h2>
          <ul className="mt-4 border-t">
            {staff.map((member) => (
              <li key={member.userId} className="border-b py-4">
                <p className="font-semibold wrap-long-words">{member.name ?? member.email}</p>
                <p className="text-muted-foreground wrap-long-words">{member.email}</p>
                <p className="mt-1 text-sm">
                  {roles(member.role)}
                  {member.role === 'counter_staff' && currency !== null
                    ? ` · ${t('limit', { amount: `${amountText(money(member.approvalLimitCents, currency))} ${currency}` })}`
                    : null}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {invitations.length === 0 ? null : (
          <section aria-labelledby={openId}>
            <h2 id={openId} className="text-title">
              {t('open.title')}
            </h2>
            <ul className="mt-4 border-t">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex flex-wrap items-start justify-between gap-2 border-b py-4">
                  <div className="min-w-0">
                    <p className="font-semibold wrap-long-words">{invitation.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {roles(invitation.role)} · {t('open.expires', { date: format.dateTime(invitation.expiresAt, { dateStyle: 'medium' }) })}
                    </p>
                  </div>
                  {invitableRoles.length === 0 ? null : <WithdrawInvitation invitationId={invitation.id} email={invitation.email} />}
                </li>
              ))}
            </ul>
          </section>
        )}

        {invitableRoles.length === 0 ? null : (
          <section aria-labelledby={inviteId} className="grid gap-5">
            <div>
              <h2 id={inviteId} className="text-title">
                {t('invite.title')}
              </h2>
              <p className="mt-2 text-muted-foreground">{t('invite.lead')}</p>
            </div>
            <PasskeyGate {...gate} returnTo="/shop/staff">
              <InviteForm roles={invitableRoles} currency={currency} />
            </PasskeyGate>
          </section>
        )}
      </div>
    </ShopFrame>
  )
}
