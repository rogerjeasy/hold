import { z } from 'zod';
import { createListeners, deleteSecure, readSecureJson, writeSecureJson } from './secure-json';

// The signed-in staff member's tokens (packages/mobile-api staff.ts), kept in the secure store. The shop is the one
// the phone is working in, chosen after signing in when the person has more than one.
const KEY = 'hold.staff-session';

const staffSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.iso.datetime(),
  shopId: z.uuid().optional(),
});
export type StaffSession = z.infer<typeof staffSessionSchema>;

const listeners = createListeners();

export const staffSession = {
  read: () => readSecureJson(KEY, staffSessionSchema),
  subscribe: listeners.subscribe,
  write: async (session: StaffSession) => {
    await writeSecureJson(KEY, session);
    listeners.notify();
  },
  clear: async () => {
    await deleteSecure(KEY);
    listeners.notify();
  },
};
