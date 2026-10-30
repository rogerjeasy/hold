import type { ItemPassport, ItemRepair } from '@hold/db'
import type { StaffRole } from '@hold/domain'
import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { SampleTag } from '@/components/ui/sample-tag'
import { ShopFrame } from '@/features/shop/shop-frame'
import { Link } from '@/i18n/navigation'
import type { ShopClock } from '@/hooks/use-shop-format'
import { shopRoutes } from '@/lib/routes'
import { EditItemForm } from './edit-item-form'
import { PassportMarks, PassportPlan, PassportSessions } from './passport-evidence'
import { PassportRentals } from './passport-rentals'
import { RepairsPanel } from '@/features/repairs/repairs-panel'
import { StatusPanel } from './status-panel'

type PassportScreenProps = { shopName: string; clock: ShopClock; passport: ItemPassport; role: StaffRole; repairs?: readonly ItemRepair[] }

// One item's record: where it is, its details, its rentals, its known marks and its chain of photographs.
export function PassportScreen({ shopName, clock, passport, role, repairs = [] }: PassportScreenProps) {
  const t = useTranslations('shop.items')
  const { item, type } = passport
  const kind = t(`categories.${type.category}`)
  const mayEdit = (role === 'owner' || role === 'manager') && item.status !== 'retired' && !item.simulated

  return (
    <ShopFrame shopName={shopName} title={item.label}>
      <div className="grid gap-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href={shopRoutes.items} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft aria-hidden="true" className="size-4" />
            {t('passport.back')}
          </Link>
          <span className="label text-xs text-muted-foreground">{t('passport.label')}</span>
          <span className="text-muted-foreground wrap-long-words">{kind.toLowerCase() === type.name.toLowerCase() ? type.name : `${type.name} · ${kind}`}</span>
          {item.simulated ? <SampleTag /> : null}
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 gap-6">
            <PassportRentals rentals={passport.rentals} clock={clock} />
            <PassportMarks marks={passport.marks} views={type.views} clock={clock} />
            <PassportSessions sessions={passport.sessions} clock={clock} />
          </div>
          {/* At the counter the status comes first; from lg it sits beside the record. */}
          <div className="grid min-w-0 gap-6 max-lg:order-first">
            <div id="status" className="scroll-mt-6">
              <StatusPanel item={item} role={role} clock={clock} />
            </div>
            <RepairsPanel itemId={item.id} repairs={repairs} marks={passport.marks} views={type.views} clock={clock} canAct={role !== 'read_only' && item.status !== 'retired'} itemInService={item.status === 'in_service'} />
            <Panel title={t('passport.details')}>
              {mayEdit ? (
                <EditItemForm itemId={item.id} label={item.label} size={item.size} serial={item.serial} />
              ) : (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 md:px-5">
                  <div className="min-w-0">
                    <dt className="text-[0.8125rem] text-muted-foreground">{t('passport.size')}</dt>
                    <dd className="font-semibold wrap-long-words">{item.size ?? t('passport.none')}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[0.8125rem] text-muted-foreground">{t('passport.serial')}</dt>
                    <dd className={item.serial === null ? 'font-semibold' : 'figures font-semibold wrap-long-words'}>{item.serial ?? t('passport.none')}</dd>
                  </div>
                </dl>
              )}
            </Panel>
            <PassportPlan views={type.views} />
          </div>
        </div>
      </div>
    </ShopFrame>
  )
}
