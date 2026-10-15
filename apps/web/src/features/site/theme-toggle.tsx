'use client'

import { Moon, Sun } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { useMounted } from '@/hooks/use-mounted'

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('theme')
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()
  // The theme is only known in the browser, so the server always renders the light-theme label.
  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label={isDark ? t('toLight') : t('toDark')}
      onClick={() => {
        setTheme(isDark ? 'light' : 'dark')
      }}
    >
      <Sun aria-hidden="true" className="hidden dark:block" />
      <Moon aria-hidden="true" className="dark:hidden" />
    </Button>
  )
}
