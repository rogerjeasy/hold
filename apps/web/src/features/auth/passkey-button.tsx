'use client'

import { Fingerprint } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { finishPasskeySignIn, startPasskeySignIn } from './actions'
import type { PasskeyFormState } from './auth-form-state'
import { askForPasskey, passkeysSupported } from './passkey-browser'

type PasskeyButtonProps = {
  // The address to sign in as: known already, or read from a field when the button is pressed.
  email: string | (() => string)
  label: string
  // A shop page to come back to, when an owner who is signed in confirms with their passkey.
  returnTo?: string
  variant?: 'default' | 'outline'
}

// Signs in, or confirms a signed-in person, with a passkey. On success the server sends the browser on.
export function PasskeyButton({ email, label, returnTo, variant = 'outline' }: PasskeyButtonProps) {
  const t = useTranslations('auth.passkey')
  const locale = useLocale()
  const [problem, setProblem] = useState<PasskeyFormState['problem'] | 'unsupported' | 'cancelled'>()
  const [pending, setPending] = useState(false)

  async function run() {
    if (!passkeysSupported()) {
      setProblem('unsupported')
      return
    }
    setPending(true)
    setProblem(undefined)
    try {
      const started = await startPasskeySignIn({ email: typeof email === 'string' ? email : email(), locale, ...(returnTo === undefined ? {} : { returnTo }) })
      if (started.requestOptions === undefined) {
        setProblem(started.problem ?? 'unavailable')
        return
      }
      const answer = await askForPasskey(started.requestOptions)
      if (answer === undefined) {
        setProblem('cancelled')
        return
      }
      // On success the server redirects, and Next.js navigates. Only a refusal comes back.
      const finished = (await finishPasskeySignIn(answer)) as PasskeyFormState | undefined
      setProblem(finished?.problem)
    } catch (error) {
      // The device refused or the person closed its prompt.
      setProblem(error instanceof DOMException ? 'cancelled' : 'unavailable')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-2">
      <Button type="button" variant={variant} disabled={pending} onClick={() => void run()} className="min-h-12">
        <Fingerprint aria-hidden="true" />
        {pending ? t('waiting') : label}
      </Button>
      {problem === undefined ? null : (
        <p role="alert" className="text-[0.9375rem] text-destructive">
          {t(`problems.${problem}`)}
        </p>
      )}
    </div>
  )
}
