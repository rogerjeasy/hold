import { z } from 'zod';
import type { ApiClient } from '@/api';
import { signOutPush } from '@/push/registration';
import { staffSession } from '@/storage/staff-session';

// Signing out revokes the refresh token at Hold, so a copy of it stops working, then forgets the tokens. With the
// counter's notifications on, it names this phone's push token, with the bearer that proves whose it is, so Hold ends
// them with the session (architecture.md section 13.9). The phone forgets the tokens even when Hold could not be
// reached: the person asked to be signed out of this phone.
export async function signOut(api: ApiClient): Promise<void> {
  const session = await staffSession.read();
  const push = await signOutPush();
  if (session !== undefined) await api.request('session/sign-out', z.object({}), { bearer: session.accessToken, body: { refreshToken: session.refreshToken, ...push } });
  await staffSession.clear();
}
