import { z } from 'zod';

// The Hold web app this build talks to, set by EXPO_PUBLIC_HOLD_API_URL at build time (see .env.example). Its host is
// also the host of the renter links the phone opens.
const webAddress = z.url({ protocol: /^https?$/ });

export type BaseUrl = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly reason: 'missing' | 'invalid' };

export function readApiBaseUrl(value: string | undefined): BaseUrl {
  if (value === undefined || value.trim() === '') return { ok: false, reason: 'missing' };
  const parsed = webAddress.safeParse(value.trim());
  return parsed.success ? { ok: true, value: parsed.data.replace(/\/+$/, '') } : { ok: false, reason: 'invalid' };
}
