import { useLocale, useTranslations } from 'next-intl'
import { submitCode, sendNewCode, startOver } from './actions'
import type { AttemptPage } from './attempt'
import { CodeForm } from './code-form'

// What the sign-in and sign-up pages show once a code is on its way.
export function CodeStep({ page }: { page: AttemptPage }) {
  const t = useTranslations('auth.code')
  const locale = useLocale()

  return (
    <div className="grid gap-5">
      <CodeForm submit={submitCode} resend={sendNewCode} />
      <form action={startOver}>
        <input type="hidden" name="page" value={page} />
        <input type="hidden" name="locale" value={locale} />
        <button type="submit" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
          {t('startOver')}
        </button>
      </form>
    </div>
  )
}
