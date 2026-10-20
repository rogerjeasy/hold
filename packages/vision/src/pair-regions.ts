import type { Region } from '@hold/domain'

export type GreyImage = { readonly data: Uint8Array; readonly width: number; readonly height: number }

// Conservative translation alignment. Scale or perspective changes this cannot align are deferred, not guessed.
// Values are starting thresholds, to be measured on the tuning set before the accuracy gate is released.
export const PAIR_LIMITS = { minAlignment: 0.92, maxShift: 8, pixelDifference: 35, tile: 4, maxRegions: 8 } as const

export function alignGreys(before: GreyImage, after: GreyImage) {
  let best = { score: -1, dx: 0, dy: 0 }
  const { width, height } = before
  for (let dy = -PAIR_LIMITS.maxShift; dy <= PAIR_LIMITS.maxShift; dy += 1) {
    for (let dx = -PAIR_LIMITS.maxShift; dx <= PAIR_LIMITS.maxShift; dx += 1) {
      const differences: number[] = []
      for (let y = 10; y < height - 10; y += 2) for (let x = 10; x < width - 10; x += 2) {
        const a = before.data[y * width + x] ?? 0
        const b = after.data[(y + dy) * width + x + dx] ?? 0
        differences.push(Math.abs(a - b))
      }
      // A small changed region must not prevent alignment. Trim the largest residuals, then score the stable area.
      differences.sort((a, b) => a - b)
      const stable = differences.slice(0, Math.floor(differences.length * 0.9))
      const score = stable.length === 0 ? 0 : 1 - stable.reduce((sum, value) => sum + value, 0) / (stable.length * 255)
      if (score > best.score) best = { score, dx, dy }
    }
  }
  return best
}

export function changedRegions(before: GreyImage, after: GreyImage, dx: number, dy: number): readonly Region[] {
  const { width, height } = before
  const tile = PAIR_LIMITS.tile
  const columns = Math.ceil(width / tile)
  const changed = new Set<number>()
  for (let y = 10; y < height - 10; y += 1) for (let x = 10; x < width - 10; x += 1) {
    const first = before.data[y * width + x] ?? 0
    const second = after.data[(y + dy) * width + x + dx] ?? 0
    if (Math.abs(first - second) > PAIR_LIMITS.pixelDifference) changed.add(Math.floor((y + dy) / tile) * columns + Math.floor((x + dx) / tile))
  }
  const regions: Region[] = []
  while (changed.size > 0) {
    const initial = changed.values().next().value
    if (initial === undefined) break
    const pending = [initial]
    changed.delete(initial)
    const component: number[] = []
    while (pending.length > 0) {
      const cell = pending.pop()
      if (cell === undefined) break
      component.push(cell)
      for (const neighbor of [cell - columns, cell + columns, ...(cell % columns > 0 ? [cell - 1] : []), ...(cell % columns < columns - 1 ? [cell + 1] : [])]) {
        if (changed.delete(neighbor)) pending.push(neighbor)
      }
    }
    if (component.length < 2) continue
    const xs = component.map((cell) => cell % columns)
    const ys = component.map((cell) => Math.floor(cell / columns))
    const left = Math.max(0, (Math.min(...xs) - 1) * tile)
    const top = Math.max(0, (Math.min(...ys) - 1) * tile)
    const right = Math.min(width, (Math.max(...xs) + 2) * tile)
    const bottom = Math.min(height, (Math.max(...ys) + 2) * tile)
    regions.push({ x: left / width, y: top / height, width: (right - left) / width, height: (bottom - top) / height })
  }
  return regions
}
