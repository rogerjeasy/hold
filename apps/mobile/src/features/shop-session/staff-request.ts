import type { z } from 'zod';
import { refreshedSchema, STAFF_ACTIONS, type StaffActionInput, type StaffActionName, type StaffActionOutput } from '@hold/mobile-api';
import type { Answer, ApiClient } from '@/api';
import { staffSession, type StaffSession } from '@/storage/staff-session';

// Every request the counter makes, as the signed-in person in the chosen shop (architecture.md section 13.7). The
// access token lives an hour: it is renewed a minute before it runs out, and once more if Hold says it has lapsed.
// A refused refresh token signs the phone out, which takes it back to signing in. A refresh that could not reach
// Hold keeps the session, so a weak signal at the counter never signs anyone out.

export type Clock = () => Date;

const RENEW_BEFORE_MS = 60_000;

export const expiresAt = (now: Date, seconds: number) => new Date(now.getTime() + seconds * 1000).toISOString();

// Two screens asking at once share one refresh, so a refresh token is never spent twice.
let renewing: Promise<Answer<StaffSession>> | undefined;

function renew(api: ApiClient, session: StaffSession, clock: Clock): Promise<Answer<StaffSession>> {
  renewing ??= (async (): Promise<Answer<StaffSession>> => {
    const answer = await api.request('session/refresh', refreshedSchema, { body: { refreshToken: session.refreshToken } });
    if (!answer.ok) {
      if (answer.failure === 'signed_out') await staffSession.clear();
      return answer;
    }
    const renewed = { ...session, accessToken: answer.value.accessToken, expiresAt: expiresAt(clock(), answer.value.expiresInSeconds) };
    await staffSession.write(renewed);
    return { ok: true, value: renewed };
  })().finally(() => {
    renewing = undefined;
  });
  return renewing;
}

// Runs `call` with a live session: the one call that needs the person's token, in the shop or before choosing one.
export async function withStaffSession<Value>(api: ApiClient, call: (session: StaffSession) => Promise<Answer<Value>>, clock: Clock = () => new Date()): Promise<Answer<Value>> {
  let session = await staffSession.read();
  if (session === undefined) return { ok: false, failure: 'signed_out' };
  if (Date.parse(session.expiresAt) - clock().getTime() < RENEW_BEFORE_MS) {
    const renewed = await renew(api, session, clock);
    if (!renewed.ok) return renewed;
    session = renewed.value;
  }
  const answer = await call(session);
  if (answer.ok || answer.failure !== 'signed_out') return answer;
  const renewed = await renew(api, session, clock);
  return renewed.ok ? call(renewed.value) : renewed;
}

const inShop = (session: StaffSession) => ({ bearer: session.accessToken, ...(session.shopId === undefined ? {} : { shopId: session.shopId }) });

// GET: something the counter reads, such as 'shop/today'.
export function staffRead<Value>(api: ApiClient, path: string, schema: z.ZodType<Value>, clock?: Clock): Promise<Answer<Value>> {
  return withStaffSession(api, (session) => api.request(path, schema, inShop(session)), clock);
}

// POST: one of the counter's quick actions, read back with the contract's own output schema.
export function staffAct<Name extends StaffActionName>(api: ApiClient, name: Name, input: StaffActionInput<Name>, locale: string, clock?: Clock): Promise<Answer<StaffActionOutput<Name>>> {
  const output = STAFF_ACTIONS[name].output as unknown as z.ZodType<StaffActionOutput<Name>>;
  return withStaffSession(api, (session) => api.request(`shop/actions/${name}`, output, { ...inShop(session), body: { ...input, locale } }), clock);
}
