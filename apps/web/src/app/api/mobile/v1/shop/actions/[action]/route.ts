import { staffActionRoute } from '@/server/mobile-staff'
import { STAFF_ACTION_ROUTES } from '@/server/mobile-staff-actions'

// The counter's quick actions from the phone, each one of the web's own server functions (architecture.md 13.7).
export const POST = staffActionRoute(STAFF_ACTION_ROUTES)
