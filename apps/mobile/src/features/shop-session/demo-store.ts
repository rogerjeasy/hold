import { useEffect, useState } from 'react';
import { z } from 'zod';
import { createListeners, deleteSecure, readSecureJson, writeSecureJson } from '@/storage/secure-json';

// The judges' demo this phone started (architecture.md section 20.3), sealed by Hold so its passwords never reach the
// phone readable, and who is signed into it now. Kept after signing out, as the web keeps it in the browser, so either
// person can be picked up again with one tap.
const KEY = 'hold.staff-demo';

export const DEMO_ACCOUNTS = ['owner', 'staff'] as const;
export type DemoAccount = (typeof DEMO_ACCOUNTS)[number];

// The demo's shop tells the phone, later, that the shop it works in is the demo's.
const keptDemoSchema = z.object({ demo: z.string().min(1), account: z.enum(DEMO_ACCOUNTS), shopId: z.uuid() });
export type KeptDemo = z.infer<typeof keptDemoSchema>;

const listeners = createListeners();

export const demoStore = {
  read: () => readSecureJson(KEY, keptDemoSchema),
  write: async (kept: KeptDemo) => {
    await writeSecureJson(KEY, kept);
    listeners.notify();
  },
  clear: async () => {
    await deleteSecure(KEY);
    listeners.notify();
  },
};

export const otherAccount = (account: DemoAccount): DemoAccount => (account === 'owner' ? 'staff' : 'owner');

// The kept demo, or null when there is none; undefined while the store is read.
export function useKeptDemo(): KeptDemo | null | undefined {
  const [kept, setKept] = useState<KeptDemo | null | undefined>(undefined);
  useEffect(() => {
    let open = true;
    const read = () => void demoStore.read().then((value) => open && setKept(value ?? null));
    read();
    const stop = listeners.subscribe(read);
    return () => {
      open = false;
      stop();
    };
  }, []);
  return kept;
}
