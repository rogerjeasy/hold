'use client'

import { LogIn, Store } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useSignedIn } from '@/hooks/use-signed-in'
import { Link } from '@/i18n/navigation'
import { routes, shopRoutes } from '@/lib/routes'

// "Sign in", or "Your shop" once this browser is signed in.
// A labelled button where there is room. On a phone the label is kept for screen readers and the icon stands for it.
export function AccountLink() {
  const t = useTranslations('nav')
  const signedIn = useSignedIn()
  const Icon = signedIn ? Store : LogIn

  return (
    <Button asChild variant="outline" className="ml-1 max-sm:size-11 max-sm:px-0">
      <Link href={signedIn ? shopRoutes.home : routes.signIn}>
        <Icon aria-hidden="true" className="sm:hidden" />
        <span className="max-sm:sr-only">{signedIn ? t('yourShop') : t('signIn')}</span>
      </Link>
    </Button>
  )
}
