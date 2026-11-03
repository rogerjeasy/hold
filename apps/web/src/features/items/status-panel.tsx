import type { CatalogItem } from '@hold/db'
import type { StaffRole } from '@hold/domain'
import { Activity } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Panel } from '@/components/ui/panel'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'
import { RentalNote } from './rental-note'
import { StandingBadge } from './standing-badge'
import { StatusChange } from './status-form'

// Where the item is, and the status moves this person may make. Counter staff may send an item to repair; only the
// owner or a manager may retire it. A retired item has no moves left. The server checks all of this again.
export function StatusPanel({ item, role, clock }: { item: CatalogItem; role: StaffRole; clock: ShopClock }) {
  const t = useTranslations('shop.items.passport.status')
  const format = useShopFormat(clock)
  const staff = role !== 'read_only' && !item.simulated
  const mayRetire = staff && (role === 'owner' || role === 'manager')
  const moves = [
    staff && item.status === 'in_service' ? <StatusChange key="repair" itemId={item.id} to="in_repair" action={t('repair')} note={t('repairNote')} /> : null,
    staff && item.status === 'in_repair' ? <StatusChange key="back" itemId={item.id} to="in_service" action={t('back')} variant="default" /> : null,
    mayRetire && item.status !== 'retired' ? <StatusChange key="retire" itemId={item.id} to="retired" action={t('retire')} note={t('retireNote')} help={t('retireHelp')} /> : null,
  ].filter((move) => move !== null)

  return (
    <Panel title={t('title')} icon={Activity}>
      <div className="grid gap-2 px-4 py-4 md:px-5">
        <div className="justify-self-start">
          <StandingBadge standing={item.standing} />
        </div>
        <RentalNote rental={item.rental} clock={clock} />
        {item.statusSince === null || item.status === 'in_service' ? null : <p className="text-sm text-muted-foreground">{t('since', { date: format.day(item.statusSince) })}</p>}
        {item.statusNote === null ? null : <p className="mt-1 rounded-xl bg-muted/70 px-3.5 py-2.5 wrap-long-words">{item.statusNote}</p>}
        {role === 'read_only' ? <p className="text-sm text-muted-foreground">{t('readOnly')}</p> : null}
      </div>
      {moves.length === 0 ? null : <div className="grid gap-5 border-t border-border/70 px-4 py-4 md:px-5">{moves}</div>}
    </Panel>
  )
}
