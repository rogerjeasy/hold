import { Bike, CalendarRange, LayoutDashboard, ShieldCheck, Tag, Users, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { shopRoutes } from '@/lib/routes'

export type ShopNavKey = keyof typeof shopRoutes

export type ShopNavGroup = {
  // Unnamed for the day's work, named for the settings below it.
  readonly label: 'settings' | null
  readonly items: readonly { readonly key: ShopNavKey; readonly icon: LucideIcon }[]
}

// The shop's pages, in menu order. Holds and claims join the first group, after rentals, as their pages are built.
export const shopNavGroups: readonly ShopNavGroup[] = [
  {
    label: null,
    items: [
      { key: 'home', icon: LayoutDashboard },
      { key: 'rentals', icon: CalendarRange },
      { key: 'items', icon: Bike },
    ],
  },
  {
    label: 'settings',
    items: [
      { key: 'prices', icon: Tag },
      { key: 'paypal', icon: Wallet },
      { key: 'staff', icon: Users },
      { key: 'security', icon: ShieldCheck },
    ],
  },
]
