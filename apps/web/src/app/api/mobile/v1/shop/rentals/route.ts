import { staffReadRoute } from '@/server/mobile-staff'
import { rentalsView } from '@/server/mobile-staff-views'

export const GET = staffReadRoute(rentalsView)
