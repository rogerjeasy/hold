import { fail } from './result.ts'
import type { Result } from './result.ts'
import type { RentalState } from './rental.ts'
import { transition } from './state-machine.ts'
import type { TransitionRefused, Transitions } from './state-machine.ts'

// One physical thing a shop rents, with its own history (architecture.md section 6.3). Its status is what the shop
// says about it; whether it is out, booked or being checked comes from the rental it is in, never from a column.

export const ITEM_STATUSES = ['in_service', 'in_repair', 'retired'] as const
export type ItemStatus = (typeof ITEM_STATUSES)[number]

// A retired item never comes back: its evidence chain ends there.
export const ITEM_TRANSITIONS: Transitions<ItemStatus> = {
  in_service: ['in_repair', 'retired'],
  in_repair: ['in_service', 'retired'],
  retired: [],
}

export type ItemStanding = 'available' | 'booked' | 'out' | 'overdue' | 'checking' | 'in_repair' | 'retired'

const STANDING_IN_RENTAL: Readonly<Record<RentalState, ItemStanding>> = {
  pending_payment: 'booked',
  booked: 'booked',
  awaiting_hold: 'booked',
  ready: 'booked',
  out: 'out',
  overdue: 'overdue',
  returned: 'checking',
  inspecting: 'checking',
  settling: 'available',
  closed: 'available',
  cancelled: 'available',
  abandoned: 'available',
}

// The order in which a rental binds its item: a renter has it, it is being checked, it is booked. Settling and
// finished rentals no longer need the item.
const BINDING: readonly ItemStanding[] = ['overdue', 'out', 'checking', 'booked']

// Of all the rentals an item is in, the one that decides where it stands, if any still needs it.
export function bindingRental(states: readonly RentalState[]): RentalState | undefined {
  let binding: RentalState | undefined
  let rank = BINDING.length
  for (const state of states) {
    const at = BINDING.indexOf(STANDING_IN_RENTAL[state])
    if (at !== -1 && at < rank) {
      binding = state
      rank = at
    }
  }
  return binding
}

// `rental` is the state of the rental that binds the item, if any (bindingRental).
export function itemStanding(status: ItemStatus, rental: RentalState | undefined): ItemStanding {
  if (status !== 'in_service') return status
  return rental === undefined ? 'available' : STANDING_IN_RENTAL[rental]
}

export type ItemStatusRefused = TransitionRefused<ItemStatus> | { readonly kind: 'with_renter' } | { readonly kind: 'rental_under_way' }

export function changeItemStatus(change: { readonly from: ItemStatus; readonly to: ItemStatus; readonly rental: RentalState | undefined }): Result<ItemStatus, ItemStatusRefused> {
  const moved = transition(ITEM_TRANSITIONS, change.from, change.to)
  if (!moved.ok) return moved
  const standing = change.rental === undefined ? 'available' : STANDING_IN_RENTAL[change.rental]
  // An item a renter has cannot be in the workshop.
  if (change.to === 'in_repair' && (standing === 'out' || standing === 'overdue')) return fail({ kind: 'with_renter' })
  // A booking, a hold or a comparison still needs the item, so it stays until that rental is over.
  if (change.to === 'retired' && standing !== 'available') return fail({ kind: 'rental_under_way' })
  return moved
}

export const ITEM_LIMITS = { label: 60, size: 20, serial: 60, addAtOnce: 50 } as const

// New items are named after their type and numbered on from the highest number already in use for that name.
export function nextItemLabels(name: string, existing: readonly string[], count: number): readonly string[] {
  const base = name.trim()
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`, 'i')
  const highest = existing.reduce((top, label) => {
    const match = pattern.exec(label.trim())
    return match === null ? top : Math.max(top, Number(match[1]))
  }, 0)
  return Array.from({ length: count }, (_, index) => `${base} ${String(highest + index + 1)}`)
}

export type ItemDraft = { readonly label: string; readonly size: string; readonly serial: string }

export type ItemProblem = { readonly kind: 'label_missing' } | { readonly kind: 'label_too_long' } | { readonly kind: 'size_too_long' } | { readonly kind: 'serial_too_long' }

export function checkItem(draft: ItemDraft): readonly ItemProblem[] {
  const problems: ItemProblem[] = []
  const label = draft.label.trim()
  if (label === '') problems.push({ kind: 'label_missing' })
  else if (label.length > ITEM_LIMITS.label) problems.push({ kind: 'label_too_long' })
  if (draft.size.trim().length > ITEM_LIMITS.size) problems.push({ kind: 'size_too_long' })
  if (draft.serial.trim().length > ITEM_LIMITS.serial) problems.push({ kind: 'serial_too_long' })
  return problems
}
