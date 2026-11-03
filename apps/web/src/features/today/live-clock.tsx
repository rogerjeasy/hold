'use client'

import { useEffect, useState } from 'react'
import type { ShopClock } from '@/hooks/use-shop-format'
import { useShopFormat } from '@/hooks/use-shop-format'

// The shop's date and time, kept current while the page stays open. It starts from the server's moment, so the page
// and the browser draw the same first line, and moves on with the browser's clock each half minute.
export function LiveClock({ now, clock }: { now: Date; clock: ShopClock }) {
  const format = useShopFormat(clock)
  const [moment, setMoment] = useState(now)
  useEffect(() => {
    const tick = setInterval(() => { setMoment(new Date()) }, 30_000)
    return () => { clearInterval(tick) }
  }, [])
  return (
    <time dateTime={moment.toISOString()}>
      {format.date(moment)} · {format.time(moment)}
    </time>
  )
}
