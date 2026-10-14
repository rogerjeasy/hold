'use client'

import type { StaffRole } from '@hold/domain'
import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { FormField } from '@/features/auth/form-field'
import { ActionMessage } from './action-message'
import { inviteStaff } from './actions'

// Invites one person by email, with their role, and for counter staff, the largest claim they may approve.
export function InviteForm({ roles, currency }: { roles: readonly StaffRole[]; currency: string | null }) {
  const t = useTranslations('shop.staff')
  const roleNames = useTranslations('shop.staff.roles')
  const locale = useLocale()
  const [result, invite, pending] = useActionState(inviteStaff, null)
  const [role, setRole] = useState<StaffRole>(roles.includes('counter_staff') ? 'counter_staff' : (roles[0] ?? 'read_only'))

  return (
    <form action={invite} className="grid gap-5">
      <input type="hidden" name="locale" value={locale} />
      <FormField name="email" label={t('invite.email')} type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={254} required />
      <div className="grid gap-1.5">
        <Label htmlFor="role">{t('invite.role')}</Label>
        <Select id="role" name="role" value={role} onChange={(event) => {
            setRole(event.target.value as StaffRole)
          }}>
          {roles.map((option) => (
            <option key={option} value={option}>
              {roleNames(option)}
            </option>
          ))}
        </Select>
      </div>
      {role === 'counter_staff' ? (
        currency === null ? (
          <p className="text-[0.9375rem] text-muted-foreground">{t('invite.limitNeedsCurrency')}</p>
        ) : (
          <FormField name="approvalLimit" label={t('invite.limit', { currency })} inputMode="decimal" autoComplete="off" maxLength={20} placeholder="0" />
        )
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-12 justify-self-start">
        {pending ? t('invite.sending') : t('invite.submit')}
      </Button>
      <ActionMessage result={result} success={t('invite.sent')} />
    </form>
  )
}
