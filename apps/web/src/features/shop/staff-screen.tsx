import { amountText, money } from '@hold/domain'
import type { StaffRole } from '@hold/domain'
import type { OpenInvitation, StaffMember } from '@hold/db'
import { Mail, UserPlus, Users } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { StatusPill } from '@/components/ui/status-pill'
import { InviteForm } from './invite-form'
import { PasskeyGate } from './passkey-gate'
import type { PasskeyGateState } from './passkey-gate'
import { ShopFrame } from './shop-frame'
import { WithdrawInvitation } from './withdraw-invitation'

type StaffScreenProps = {
  shopName: string
  currency: string | null
  staff: readonly StaffMember[]
  invitations: readonly OpenInvitation[]
  // The roles this person may invite. Empty for someone who may invite nobody.
  invitableRoles: readonly StaffRole[]
  gate: PasskeyGateState
}

// The first letter of a person's name or address, for the round badge beside it.
function initial(text: string): string {
  return text.trim().charAt(0).toUpperCase()
}

// Every row's text sits in a grid track that may shrink below its content, so a long address wraps rather than
// widening the page (F-M2).
export function StaffScreen({ shopName, currency, staff, invitations, invitableRoles, gate }: StaffScreenProps) {
  const t = useTranslations('shop.staff')
  const roles = useTranslations('shop.staff.roles')
  const format = useFormatter()

  return (
    <ShopFrame shopName={shopName} title={t('title')} description={t('lead')}>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-6">
          <Panel title={t('team')} icon={Users} aside={<span className="figures text-sm text-muted-foreground">{staff.length}</span>}>
            <ul className="stagger">
              {staff.map((member) => (
                <li key={member.userId} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-b border-border/70 px-4 py-3.5 last:border-b-0 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] md:px-5">
                  <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-contrast text-sm font-bold text-contrast-foreground">{initial(member.name ?? member.email)}</span>
                  <div className="min-w-0">
                    <p className="font-semibold wrap-long-words">{member.name ?? member.email}</p>
                    <p className="text-sm text-muted-foreground wrap-long-words">{member.email}</p>
                    {member.role === 'counter_staff' && currency !== null ? (
                      <p className="mt-1 text-sm">{t('limit', { amount: `${amountText(money(member.approvalLimitCents, currency))} ${currency}` })}</p>
                    ) : null}
                  </div>
                  <StatusPill tone={member.role === 'owner' ? 'progress' : 'neutral'} className="col-start-2 justify-self-start sm:col-start-3">{roles(member.role)}</StatusPill>
                </li>
              ))}
            </ul>
          </Panel>

          {invitations.length === 0 ? null : (
            <Panel title={t('open.title')} icon={Mail} aside={<span className="figures text-sm text-muted-foreground">{invitations.length}</span>}>
              <ul className="stagger">
                {invitations.map((invitation) => (
                  <li key={invitation.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-b border-border/70 px-4 py-3.5 last:border-b-0 md:px-5">
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
            </Panel>
          )}
        </div>

        {/* The gate is a card of its own, so it stands in for the invitation card rather than sitting inside it. */}
        {invitableRoles.length === 0 ? null : gate.needed ? (
          <PasskeyGate {...gate} returnTo="/shop/staff">{null}</PasskeyGate>
        ) : (
          <Panel title={t('invite.title')} icon={UserPlus} className="lg:sticky lg:top-6">
            <div className="grid gap-5 p-4 md:p-5">
              <p className="text-sm text-muted-foreground">{t('invite.lead')}</p>
              <InviteForm roles={invitableRoles} currency={currency} />
            </div>
          </Panel>
        )}
      </div>
    </ShopFrame>
  )
}
