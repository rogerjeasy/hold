import type { VerificationKey } from '@hold/trust/verify'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PageIntro } from '@/features/marketing/page-intro'
import { Section } from '@/features/marketing/section'
import { timeZone } from '@/i18n/time-zone'
import { CREDENTIAL_KEYS_PATH } from '@/lib/routes'
import { SignedCheck } from './signed-check'

// The public page that checks a Clean Record credential (extensions.md section 7.7), with the key Hold publishes at a
// well-known address, so anyone can check one without asking Hold. The check sits on one calm card.
export function VerifyScreen({ keys }: { keys: readonly VerificationKey[] }) {
  const t = useTranslations('trust.verify')
  return (
    <>
      <PageIntro title={t('title')} lead={t('lead')} />
      <Section>
        <div className="grid max-w-3xl gap-5">
          <div className="surface relative overflow-clip p-5 md:p-8">
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
            <span aria-hidden="true" className="mb-5 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </span>
            <SignedCheck keys={keys} timeZone={timeZone} />
          </div>
          <a
            href={CREDENTIAL_KEYS_PATH}
            className="group inline-flex min-h-11 items-center gap-2 justify-self-start font-semibold underline decoration-primary/50 decoration-2 underline-offset-4 transition-colors hover:decoration-primary"
          >
            <KeyRound aria-hidden="true" className="size-4 text-primary" />
            {t('key')}
          </a>
        </div>
      </Section>
    </>
  )
}
