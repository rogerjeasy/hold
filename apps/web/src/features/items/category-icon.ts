import type { ItemCategory } from '@hold/domain'
import { Bike, Camera, Hammer, Package, PartyPopper, Sailboat, Scooter, Snowflake, Tent, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// The sign beside a type's name: what kind of thing it is, at a glance. The kind is always also said in words.
export const CATEGORY_ICONS: Readonly<Record<ItemCategory, LucideIcon>> = {
  bike: Bike,
  e_bike: Zap,
  scooter: Scooter,
  water: Sailboat,
  snow: Snowflake,
  camera: Camera,
  camping: Tent,
  event: PartyPopper,
  tool: Hammer,
  other: Package,
}
