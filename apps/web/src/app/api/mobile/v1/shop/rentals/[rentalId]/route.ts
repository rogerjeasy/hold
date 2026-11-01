import { staffReadRoute } from '@/server/mobile-staff'
import { rentalView } from '@/server/mobile-staff-views'

export const GET = staffReadRoute(rentalView)
