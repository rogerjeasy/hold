import { isRenterViewName } from '@hold/mobile-api'
import { answer, failed } from '@/server/mobile-json'
import { mobileRenterRoute } from '@/server/mobile-renter-route'
import { renterViewAnswer } from '@/server/mobile-renter-views'

// A renter screen for the phone app (architecture.md section 13.8), read through the link the bearer token names.
// Reading changes nothing.
export const GET = mobileRenterRoute<{ view: string }>(async ({ token, locale }, { view }) =>
  answer(isRenterViewName(view) ? await renterViewAnswer(view, token, locale) : failed('not_found')),
)
