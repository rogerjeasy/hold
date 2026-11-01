import { isRenterActionName, renterActions } from '@hold/mobile-api'
import { answer, failed, formFromJson, readJsonObject } from '@/server/mobile-json'
import { MOBILE_RENTER_ACTIONS } from '@/server/mobile-renter-actions'
import { mobileRenterRoute } from '@/server/mobile-renter-route'

// The phone's renter actions (architecture.md section 13.8). The JSON body becomes the form the renter's web page
// sends, with the bearer token and the language set over anything the body says, and goes to the same server function,
// which checks the link, its scope and rate, validates, acts and writes the audit line. Only the request's framing is
// read before that: its size, and that it is one flat JSON object.
export const POST = mobileRenterRoute<{ name: string }>(async ({ request, token, locale }, { name }) => {
  if (!isRenterActionName(name)) return answer(failed('not_found'))
  const body = await readJsonObject(request)
  const form = body === undefined ? undefined : formFromJson(body)
  if (form === undefined) return answer(failed('invalid', { fields: [] }))
  if (!form.ok) return answer(failed('invalid', { fields: form.fields }))
  form.form.set('token', token)
  form.form.set('locale', locale)
  const result = await MOBILE_RENTER_ACTIONS[name](null, form.form)
  // Only what the contract names goes back to the phone.
  return answer(result.ok ? { ok: true, value: renterActions[name].output.parse(result.value) } : result)
})
