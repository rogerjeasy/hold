import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// The dates first, as an ordinary form that puts them in the address: what is free depends on them, and the page
// reads them back from there. Times are on the shop's clock.
export function PeriodForm({ from, to, invalid }: { from: string; to: string; invalid: boolean }) {
  const t = useTranslations('booking')
  return (
    <form method="get" className="grid gap-4 border bg-card p-4 text-card-foreground md:p-5">
      <h2 className="text-[1.0625rem] font-extrabold tracking-tight">{t('when')}</h2>
      <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="from">{t('starts')}</Label>
          <Input id="from" name="from" type="datetime-local" defaultValue={from} required />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="to">{t('ends')}</Label>
          <Input id="to" name="to" type="datetime-local" defaultValue={to} required />
        </div>
        <Button type="submit" variant="outline" className="justify-self-start sm:col-span-2">
          {t('check')}
        </Button>
      </div>
      {invalid ? (
        <p role="alert" className="text-[0.9375rem] text-destructive">
          {t('periodInvalid')}
        </p>
      ) : null}
    </form>
  )
}
