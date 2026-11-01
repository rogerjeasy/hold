import { staffReadRoute } from '@/server/mobile-staff'
import { todayView } from '@/server/mobile-staff-views'

export const GET = staffReadRoute(todayView)
