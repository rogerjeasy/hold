'use client'
import type { ClaimPromise } from '@hold/db'
import type { ClaimState } from '@hold/domain'
import { Clock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Notice } from '@/components/ui/notice'
import { useShopFormat } from '@/hooks/use-shop-format'

// The shop's promise to decide a contested claim (architecture.md section 6.16), on both claim pages. The server
// decides where it stands; this only says so.

type StatusProps = { readonly promise: ClaimPromise; readonly audience: 'renter' | 'shop'; readonly claimState: ClaimState; readonly shopName: string; readonly timeZone: string; readonly now: Date }

// Before the renter contests: what the shop promises if they do.
export function PromiseBeforeContest({ shopName, days }: { shopName: string; days: number }) {
  const t = useTranslations('promise.renter')
  return (
    <div className="grid gap-1 rounded-xl border border-border/70 bg-muted/50 px-3.5 py-3">
      <p className="label text-xs text-muted-foreground">{t('beforeLabel')}</p>
      <p className="text-pretty">{t('beforeBody', { shop: shopName, days })}</p>
    </div>
  )
}

export function PromiseStatus({ promise, audience, claimState, shopName, timeZone, now }: StatusProps) {
  const t = useTranslations('promise')
  const format = useShopFormat({ timeZone, currency: null })
  if (promise.decideBy === null) return null
  const due = format.deadline(promise.decideBy)
  const voice = audience === 'renter' ? 'renter' : 'shop'
  if (promise.standing === 'open') {
    return (
      <div className="surface flex min-w-0 items-center gap-4 p-4 md:p-5">
        <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-warning/14 text-warning"><Clock className="size-6" /></span>
        <div className="grid min-w-0 gap-0.5">
          <p className="label text-xs text-muted-foreground">{t(`${voice}.openLabel`)}</p>
          <p className="text-figure wrap-long-words">{due}</p>
          <p className="text-sm text-muted-foreground">{promise.decideBy > now ? format.fromNow(promise.decideBy, now) : t('dueNow')}</p>
        </div>
      </div>
    )
  }
  const decided = promise.decidedAt === null ? null : format.deadline(promise.decidedAt)
  if (promise.standing === 'kept') return <p className="text-pretty text-muted-foreground">{audience === 'renter' ? t('renter.keptBody', { shop: shopName, when: decided ?? due }) : t('shop.keptBody', { when: decided ?? due })}</p>
  if (audience === 'shop') {
    if (decided !== null) return <p className="text-muted-foreground">{t('shop.lateBody', { when: decided })}</p>
    return <Notice tone="destructive" title={t('shop.missedLabel')} body={t('shop.missedBody', { when: due })} />
  }
  if (claimState === 'waived' && promise.missedReason === null && promise.decidedAt !== null) return <Notice tone="success" title={t('renter.waivedTitle')} body={t('renter.waivedBody', { shop: shopName, when: due })} />
  if (promise.missedReason !== null) {
    return (
      <Notice tone="destructive" title={t('renter.lateTitle')} body={t('renter.lateBody', { shop: shopName, when: due })}>
        <blockquote className="mt-2 border-l-2 pl-3 whitespace-pre-wrap wrap-long-words">{promise.missedReason}</blockquote>
      </Notice>
    )
  }
  return <Notice tone="destructive" title={t('renter.missedTitle')} body={t('renter.missedBody', { shop: shopName, when: due })} />
}
