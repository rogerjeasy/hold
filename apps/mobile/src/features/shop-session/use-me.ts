import { meSchema } from '@hold/mobile-api';
import { useAnswer } from '@/api';
import { withStaffSession } from './staff-request';

// Who is signed in, and the shops they work in with their role in each.
export function useMe(key: string) {
  return useAnswer(`me:${key}`, (api) => withStaffSession(api, (session) => api.request('session/me', meSchema, { bearer: session.accessToken })));
}
