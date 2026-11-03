import { CreditCard, MailCheck, Tags } from 'lucide-react'
import { useTranslations } from 'next-intl'

const steps = [
  { key: 'email', icon: MailCheck },
  { key: 'paypal', icon: CreditCard },
  { key: 'prices', icon: Tags },
] as const

// What a new owner does after the form, in order, down a thread. The list is named by the heading above it.
export function SignUpSteps({ labelledBy }: { labelledBy: string }) {
  const t = useTranslations('auth.signUp.aside.steps')

  return (
    <ol role="list" aria-labelledby={labelledBy} className="stagger grid">
      {steps.map(({ key, icon: Icon }, index) => (
        <li key={key} className="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-4 pb-8 last:pb-0">
          {index < steps.length - 1 ? (
            <span aria-hidden="true" className="absolute top-12 bottom-1 left-[1.375rem] border-l border-dashed border-band-border" />
          ) : null}
          <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl border border-band-border bg-band-hover text-band-accent">
            <Icon className="size-5" />
          </span>
          <div className="pt-1.5">
            <h3 className="text-xl leading-tight font-bold tracking-tight wrap-long-words">{t(`${key}.title`)}</h3>
            <p className="mt-2 text-band-muted">{t(`${key}.body`)}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
