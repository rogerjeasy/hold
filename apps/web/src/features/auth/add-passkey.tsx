'use client'

import { KeyRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { finishPasskeyRegistration, startPasskeyRegistration } from './actions'
import { makePasskey, passkeysSupported } from './passkey-browser'

// Registers a passkey on this device for the person who is signed in.
export function AddPasskey() {
  const t = useTranslations('auth.passkey')
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'pending' | 'added' | 'unsupported' | 'cancelled' | 'unavailable'>('idle')

  async function add() {
    if (!passkeysSupported()) {
      setState('unsupported')
      return
    }
    setState('pending')
    try {
      const started = await startPasskeyRegistration()
      if (started.creationOptions === undefined) {
        setState('unavailable')
        return
      }
      const made = await makePasskey(started.creationOptions)
      if (made === undefined) {
        setState('cancelled')
        return
      }
      const finished = await finishPasskeyRegistration(made)
      setState(finished.registered === true ? 'added' : 'unavailable')
      router.refresh()
    } catch (error) {
      setState(error instanceof DOMException ? 'cancelled' : 'unavailable')
    }
  }

  return (
    <div className="grid gap-2">
      <Button type="button" disabled={state === 'pending'} onClick={() => void add()} className="min-h-12 justify-self-start">
        <KeyRound aria-hidden="true" />
        {state === 'pending' ? t('waiting') : t('add')}
      </Button>
      {state === 'added' ? (
        <p role="status" className="text-[0.9375rem]">
          {t('added')}
        </p>
      ) : null}
      {state === 'unsupported' || state === 'cancelled' || state === 'unavailable' ? (
        <p role="alert" className="text-[0.9375rem] text-destructive">
          {t(`problems.${state}`)}
        </p>
      ) : null}
    </div>
  )
}
