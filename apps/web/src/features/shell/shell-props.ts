import type { StaffRole } from '@hold/domain'
import type { Person } from '@hold/db'

// What every part of the shop's frame is told: who is signed in, in which shop, and whether PayPal is connected.
export type ShellProps = {
  readonly person: Person
  readonly shop: { readonly id: string; readonly name: string }
  readonly role: StaffRole
  readonly paypalConnected: boolean
}
