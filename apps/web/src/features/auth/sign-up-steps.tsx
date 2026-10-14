import { useTranslations } from 'next-intl'

const stepKeys = ['email', 'paypal', 'prices'] as const

// What a new owner does after the form, in order. The list is named by the heading above it.
export function SignUpSteps({ labelledBy }: { labelledBy: string }) {
  const t = useTranslations('auth.signUp.aside.steps')

  return (
    <ol role="list" aria-labelledby={labelledBy} className="border-t border-t-band-foreground">
      {stepKeys.map((key, index) => (
        <li key={key} className="grid grid-cols-[2.5rem_minmax(0,1fr)] border-b border-band-border py-5">
          <span aria-hidden="true" className="figures pt-1 text-sm text-band-accent">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div>
            <h3 className="text-xl leading-tight font-bold tracking-tight wrap-long-words">{t(`${key}.title`)}</h3>
            <p className="mt-2 text-band-muted">{t(`${key}.body`)}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
