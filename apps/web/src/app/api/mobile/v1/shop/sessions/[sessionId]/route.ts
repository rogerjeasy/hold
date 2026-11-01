import { staffReadRoute } from '@/server/mobile-staff'
import { captureSessionView } from '@/server/mobile-staff-views'

export const GET = staffReadRoute(captureSessionView)
