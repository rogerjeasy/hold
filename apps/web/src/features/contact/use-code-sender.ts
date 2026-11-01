'use client'
import { startTransition, useActionState } from 'react'

// Asks for a one-time code where the renter chose, or by email instead (architecture.md section 12.3), from a button
// that may sit inside another form. `fields` are the action's own: the token, the locale and any it needs.
export function useCodeSender<Result>(action: (previous: unknown, data: FormData) => Promise<Result>, fields: Readonly<Record<string, string>>) {
  const [result, dispatch, pending] = useActionState(action, null)
  const send = (via: 'chosen' | 'email') => {
    const data = new FormData()
    for (const [name, value] of Object.entries(fields)) data.set(name, value)
    data.set('via', via)
    startTransition(() => { dispatch(data) })
  }
  return { result, pending, send: () => { send('chosen') }, sendByEmail: () => { send('email') } }
}
