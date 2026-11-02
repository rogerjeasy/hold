import type { VerificationKey } from '@hold/trust/verify'
import { useTranslations } from 'next-intl'
import { PageIntro } from '@/features/marketing/page-intro'
import { Section } from '@/features/marketing/section'
import { timeZone } from '@/i18n/time-zone'
import { CREDENTIAL_KEYS_PATH } from '@/lib/routes'
import { SignedCheck } from './signed-check'

// The public page that checks a Clean Record credential (extensions.md section 7.7), with the key Hold publishes at a
// well-known address, so anyone can check one without asking Hold.
export function VerifyScreen({ keys }: { keys: readonly VerificationKey[] }) {
  const t = useTranslations('trust.verify')
  return (
    <>
      <PageIntro title={t('title')} lead={t('lead')} />
      <Section>
        <div className="grid max-w-3xl gap-6">
          <SignedCheck keys={keys} timeZone={timeZone} />
          <a href={CREDENTIAL_KEYS_PATH} className="inline-flex min-h-11 items-center justify-self-start font-semibold underline underline-offset-4">
            {t('key')}
          </a>
        </div>
      </Section>
    </>
  )
}
