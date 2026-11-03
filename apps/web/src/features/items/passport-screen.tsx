import type { ItemPassport, ItemRepair } from '@hold/db'
import type { StaffRole } from '@hold/domain'
import { ArrowLeft, IdCard, Tag } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import { SampleTag } from '@/components/ui/sample-tag'
import { RepairsPanel } from '@/features/repairs/repairs-panel'
import { ShopFrame } from '@/features/shop/shop-frame'
import { Link } from '@/i18n/navigation'
import type { ShopClock } from '@/hooks/use-shop-format'
import { shopRoutes } from '@/lib/routes'
import { CATEGORY_ICONS } from './category-icon'
import { EditItemForm } from './edit-item-form'
import { PassportMarks, PassportPlan, PassportSessions } from './passport-evidence'
import { PassportRentals } from './passport-rentals'
import { StatusPanel } from './status-panel'

type PassportScreenProps = { shopName: string; clock: ShopClock; passport: ItemPassport; role: StaffRole; repairs?: readonly ItemRepair[] }

function Detail({ label, value, figure = false }: { label: string; value: string; figure?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className={figure ? 'figures font-semibold wrap-long-words' : 'font-semibold wrap-long-words'}>{value}</dd>
    </div>
  )
}

// One item's record: where it is, its details, its rentals, its known marks and its chain of photographs.
export function PassportScreen({ shopName, clock, passport, role, repairs = [] }: PassportScreenProps) {
  const t = useTranslations('shop.items')
  const { item, type } = passport
  const kind = t(`categories.${type.category}`)
  const KindIcon = CATEGORY_ICONS[type.category]
  const mayEdit = (role === 'owner' || role === 'manager') && item.status !== 'retired' && !item.simulated

  return (
    <ShopFrame shopName={shopName} title={item.label}>
      <div className="grid gap-8">
        <div className="-mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 md:-mt-6">
          <Link href={shopRoutes.items} className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-semibold text-muted-foreground transition-colors hover:bg-foreground/6 hover:text-foreground">
            <ArrowLeft aria-hidden="true" className="size-4" />
            {t('passport.back')}
          </Link>
          <span aria-hidden="true" className="h-5 w-px bg-border" />
          <span className="label inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[0.6875rem] text-primary">
            <IdCard aria-hidden="true" className="size-3.5" />
            {t('passport.label')}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground wrap-long-words">
            <KindIcon aria-hidden="true" className="size-4 shrink-0" />
            {kind.toLowerCase() === type.name.toLowerCase() ? type.name : `${type.name} · ${kind}`}
          </span>
          {item.simulated ? <SampleTag /> : null}
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 gap-6">
            <PassportRentals rentals={passport.rentals} clock={clock} />
            <PassportMarks marks={passport.marks} views={type.views} clock={clock} />
            <PassportSessions sessions={passport.sessions} clock={clock} />
            <PassportPlan views={type.views} />
          </div>
          {/* At the counter the status comes first; from lg it sits beside the record. */}
          <div className="grid min-w-0 gap-6 max-lg:order-first">
            <div id="status" className="scroll-mt-6">
              <StatusPanel item={item} role={role} clock={clock} />
            </div>
            <RepairsPanel itemId={item.id} repairs={repairs} marks={passport.marks} views={type.views} clock={clock} canAct={role !== 'read_only' && item.status !== 'retired'} itemInService={item.status === 'in_service'} />
            <Panel title={t('passport.details')} icon={Tag}>
              {mayEdit ? (
                <EditItemForm itemId={item.id} label={item.label} size={item.size} serial={item.serial} />
              ) : (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 md:px-5">
                  <Detail label={t('passport.size')} value={item.size ?? t('passport.none')} />
                  <Detail label={t('passport.serial')} value={item.serial ?? t('passport.none')} figure={item.serial !== null} />
                </dl>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </ShopFrame>
  )
}
