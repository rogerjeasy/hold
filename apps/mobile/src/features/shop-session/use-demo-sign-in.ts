import { useState } from 'react';
import { demoStartedSchema } from '@hold/mobile-api';
import { useApi, type ApiClient } from '@/api';
import type { Refusal } from './refusal';
import { staffSession } from '@/storage/staff-session';
import { demoStore, type DemoAccount } from './demo-store';
import { expiresAt } from './staff-request';

// One tap into the judges' demo: a fresh one, or the one this phone keeps, as Tomás or Jonas. The answer names the
// demo's shop, so the phone goes straight to its day.
export async function signIntoDemo(api: ApiClient, account: DemoAccount, demo: string | undefined): Promise<Refusal | undefined> {
  const started = await api.request('session/demo', demoStartedSchema, { body: demo === undefined ? { account } : { account, demo } });
  if (!started.ok) return started;
  const { accessToken, refreshToken, expiresInSeconds, shopId } = started.value;
  await demoStore.write({ demo: started.value.demo, account, shopId });
  await staffSession.write({ accessToken, refreshToken, expiresAt: expiresAt(new Date(), expiresInSeconds), shopId });
  return undefined;
}

export function useDemoSignIn() {
  const api = useApi();
  const [pending, setPending] = useState<DemoAccount | 'fresh' | undefined>(undefined);
  const [refusal, setRefusal] = useState<Refusal | undefined>(undefined);
  const start = async (account: DemoAccount, demo: string | undefined, which: DemoAccount | 'fresh' = account) => {
    setPending(which);
    setRefusal(undefined);
    try {
      setRefusal(await signIntoDemo(api, account, demo));
    } finally {
      setPending(undefined);
    }
  };
  return { start, pending, refusal };
}
