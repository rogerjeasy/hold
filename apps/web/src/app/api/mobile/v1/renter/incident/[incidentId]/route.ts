import { z } from 'zod'
import { answer, failed } from '@/server/mobile-json'
import { mobileRenterRoute } from '@/server/mobile-renter-route'
import { renterIncidentAnswer } from '@/server/mobile-renter-views'

// One report the renter made during the rental. Another rental's report is not found, as is anything but an id.
export const GET = mobileRenterRoute<{ incidentId: string }>(async ({ token }, { incidentId }) =>
  answer(z.uuid().safeParse(incidentId).success ? await renterIncidentAnswer(token, incidentId) : failed('not_found')),
)
