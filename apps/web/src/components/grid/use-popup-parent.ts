'use client'

import { useEffect, useState } from 'react'

// Where a grid draws its menus, filters and lists: the page's body, so a grid sized to its rows never cuts one off at
// its last row. Known only in the browser, after the page is drawn.
export function usePopupParent(): HTMLElement | undefined {
  const [parent, setParent] = useState<HTMLElement | undefined>(undefined)
  useEffect(() => { setParent(document.body) }, [])
  return parent
}
