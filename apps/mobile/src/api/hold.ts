import { getLocales } from 'expo-localization';
import { pickLocale } from '@/i18n';
import { createApiClient, type ApiClient } from './client';
import { readApiBaseUrl } from './config';

// Long enough for a phone on a weak signal at the counter, short enough that nobody waits on a frozen screen.
const REQUEST_TIMEOUT_MS = 15_000;

// The address this build was given. A build without one is a mistake in the build, not something a person can fix,
// so the first request says so loudly instead of failing quietly.
export function holdBaseUrl(): string {
  const base = readApiBaseUrl(process.env.EXPO_PUBLIC_HOLD_API_URL);
  if (!base.ok) throw new Error(`EXPO_PUBLIC_HOLD_API_URL is ${base.reason}: set it in apps/mobile/.env (see .env.example).`);
  return base.value;
}

// The hosts whose rental links this build opens: the host of the web app it talks to.
export function holdLinkHosts(): string[] {
  const base = readApiBaseUrl(process.env.EXPO_PUBLIC_HOLD_API_URL);
  const host = base.ok ? /^https?:\/\/([^/]+)/.exec(base.value)?.[1] : undefined;
  return host === undefined ? [] : [host.toLowerCase()];
}

let client: ApiClient | undefined;

export function holdApi(): ApiClient {
  client ??= createApiClient({
    baseUrl: holdBaseUrl(),
    fetch: globalThis.fetch,
    timeoutMs: REQUEST_TIMEOUT_MS,
    locale: () => pickLocale(getLocales()),
  });
  return client;
}
