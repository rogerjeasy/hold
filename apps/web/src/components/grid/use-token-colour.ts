'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

// A design token's colour as the canvas AG Charts draws on needs it: the value itself, read again when the theme
// changes, since a canvas cannot read a CSS variable. Until the page is drawn in the browser, the fallback.
export function useTokenColour(token: `--${string}`, fallback: string): string {
  const { resolvedTheme } = useTheme()
  const [colour, setColour] = useState(fallback)
  useEffect(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    setColour(value === '' ? fallback : value)
  }, [token, fallback, resolvedTheme])
  return colour
}
