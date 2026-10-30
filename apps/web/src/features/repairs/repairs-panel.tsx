'use client'
import type { ItemRepair, PassportMark, PhotoPlanView } from '@hold/db'
import type { ShopClock } from '@/hooks/use-shop-format'
import { ChooseMarksForm } from './choose-marks-form'
import { OpenRepairCard } from './open-repair-card'
import { RepairHistory } from './repair-history'

type Props = { itemId: string; repairs: readonly ItemRepair[]; marks: readonly PassportMark[]; views: readonly PhotoPlanView[]; clock: ShopClock; canAct: boolean; itemInService: boolean }

// An item's repairs on its passport (architecture.md section 9.6): those to do, a way to open one for marks no repair
// covers, and those done.
export function RepairsPanel({ itemId, repairs, marks, views, clock, canAct, itemInService }: Props) {
  const open = repairs.filter((repair) => repair.state === 'open')
  const done = repairs.filter((repair) => repair.state === 'done')
  const covered = new Set(open.flatMap((repair) => repair.lines.flatMap((line) => (line.markId === null ? [] : [line.markId]))))
  const choosable = marks.filter((mark) => mark.status === 'open' && !covered.has(mark.id))
  if (open.length === 0 && done.length === 0 && (choosable.length === 0 || !canAct)) return null
  return (
    <div className="grid gap-6">
      {open.map((repair) => <OpenRepairCard key={repair.id} itemId={itemId} repair={repair} clock={clock} canAct={canAct} itemInService={itemInService} />)}
      {canAct && choosable.length > 0 ? <ChooseMarksForm itemId={itemId} marks={choosable} views={views} /> : null}
      {done.length === 0 ? null : <RepairHistory repairs={done} clock={clock} />}
    </div>
  )
}
