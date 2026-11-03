import { Camera, HandCoins, LockKeyhole, ScanSearch } from 'lucide-react'

// One picture for each of a rental's four moments, the same on the home page and on How it works.
export const momentIcons = {
  reserve: LockKeyhole,
  handOver: Camera,
  return: ScanSearch,
  settle: HandCoins,
} as const

export type MomentKey = keyof typeof momentIcons

export const momentKeys: readonly MomentKey[] = ['reserve', 'handOver', 'return', 'settle']
