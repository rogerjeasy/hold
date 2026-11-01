import { z } from 'zod';
import type { ApiClient } from '@/api';
import { signOutPush } from '@/push/registration';
import { staffSession } from '@/storage/staff-session';
import { renewalSettled, withStaffSession, type Clock } from './staff-request';

// Signing out revokes the refresh token at Hold, so a copy of it stops working, then forgets the tokens. With the
// counter's notifications on, it names this phone's push token, with the bearer that proves whose it is, so Hold ends
// them with the session (architecture.md section 13.9). The bearer is renewed first when it has lapsed, as for any
// request, since Hold ends a phone's notifications only for a live one. The phone forgets the tokens even when Hold
// could not be reached: the person asked to be signed out of this phone.
export async function signOut(api: ApiClient, clock?: Clock): Promise<void> {
  const push = await signOutPush();
  await withStaffSession(api, (session) => api.request('session/sign-out', z.object({}), { bearer: session.accessToken, body: { refreshToken: session.refreshToken, ...push } }), clock);
  await renewalSettled();
  await staffSession.clear();
}
