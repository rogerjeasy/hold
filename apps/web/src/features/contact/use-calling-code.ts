'use client'
import { callingCodeFor } from '@hold/domain'
import { useEffect, useState } from 'react'

// The country code a number typed on this phone most likely starts with, from the phone's own region, so a tourist
// writes only their number. Empty where the region is unknown or Hold does not text there.
export function useCallingCode(): string {
  const [prefix, setPrefix] = useState('')
  useEffect(() => {
    const region = navigator.languages.map((language) => new Intl.Locale(language).maximize().region).find((each) => each !== undefined)
    const code = region === undefined ? undefined : callingCodeFor(region)
    if (code !== undefined) setPrefix(`+${code} `)
  }, [])
  return prefix
}
