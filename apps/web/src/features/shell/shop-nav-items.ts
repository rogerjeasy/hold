import { BadgeCheck, Banknote, Bike, ChartColumn, CalendarDays, CalendarRange, Gauge, Handshake, Inbox, LayoutDashboard, ListChecks, MapPin, ShieldCheck, Siren, Tag, Users, Wallet } from 'lucide-react'
import type { StaffRole } from '@hold/domain'
import type { LucideIcon } from 'lucide-react'
import { shopRoutes } from '@/lib/routes'

export type ShopNavKey = keyof typeof shopRoutes

export type ShopNavGroup = {
  // Unnamed for the day's work, named for the settings below it.
  readonly label: 'settings' | null
  // A page only some roles may open names them; the page still checks on the server.
  readonly items: readonly { readonly key: ShopNavKey; readonly icon: LucideIcon; readonly roles?: readonly StaffRole[] }[]
}

// The shop's pages, in menu order. Holds and claims join the first group, after rentals, as their pages are built.
export const shopNavGroups: readonly ShopNavGroup[] = [
  {
    label: null,
    items: [
      { key: 'home', icon: LayoutDashboard },
      { key: 'decisions', icon: Inbox },
      { key: 'queue', icon: ListChecks },
      { key: 'rentals', icon: CalendarRange },
      { key: 'calendar', icon: CalendarDays },
      { key: 'money', icon: Banknote },
      { key: 'insights', icon: ChartColumn, roles: ['owner', 'manager'] },
      { key: 'items', icon: Bike },
      { key: 'incidents', icon: Siren },
      { key: 'scorecard', icon: Gauge },
    ],
  },
  {
    label: 'settings',
    items: [
      { key: 'prices', icon: Tag },
      { key: 'trust', icon: BadgeCheck },
      { key: 'selfService', icon: MapPin },
      { key: 'settlement', icon: Handshake },
      { key: 'paypal', icon: Wallet },
      { key: 'staff', icon: Users },
      { key: 'security', icon: ShieldCheck },
    ],
  },
]

// The menu as one person sees it: without the pages their role does not open.
export function navGroupsFor(role: StaffRole): readonly ShopNavGroup[] {
  return shopNavGroups.map((group) => ({ ...group, items: group.items.filter((item) => item.roles === undefined || item.roles.includes(role)) }))
}
