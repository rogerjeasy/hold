import { LogOut } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { Person } from '@hold/db'
import { Button } from '@/components/ui/button'
import { signOut } from '@/features/auth/actions'

function SignOutForm() {
  const t = useTranslations('shop')
  const locale = useLocale()
  return (
    <form action={signOut} className="mt-12">
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="outline" className="min-h-11">
        <LogOut aria-hidden="true" />
        {t('signOut')}
      </Button>
    </form>
  )
}

// A signed-in person with an account and no shop: a sign-up whose shop could not be created, or someone not yet
// invited anywhere.
export function NoShop({ person }: { person: Person | undefined }) {
  const t = useTranslations('shop')
  return (
    <div className="mx-auto w-full max-w-page px-4 pt-9 pb-14 md:px-8 md:pt-14 lg:px-10 lg:pt-16">
      <div className="max-w-prose min-w-0">
        <h1 className="text-headline text-balance wrap-long-words">{t('noShop.title')}</h1>
        {person === undefined ? null : <p className="mt-5 text-lead text-muted-foreground wrap-long-words">{t('signedInAs', { email: person.email })}</p>}
        <p className="mt-3 text-muted-foreground">{t('noShop.body')}</p>
      </div>
      <SignOutForm />
    </div>
  )
}
