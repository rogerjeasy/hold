import { z } from 'zod';
import { createListeners, readSecureJson, writeSecureJson } from '@/storage/secure-json';

// What this phone keeps of its push notifications (architecture.md section 13.9), in the secure store, since it names
// rental links: for each saved rental whether the renter turned them on, and the reference Hold gave this phone for it,
// which is all a push carries; whether the counter's are on; and the push token last registered, to notice a new one.
const KEY = 'hold.push';

const rentalChoice = z.discriminatedUnion('state', [z.object({ state: z.literal('on'), reference: z.string().min(1) }), z.object({ state: z.literal('off') })]);
export type RentalPushChoice = z.infer<typeof rentalChoice>;
const schema = z.object({ rentals: z.record(z.string(), rentalChoice), counter: z.enum(['on', 'off']).optional(), lastToken: z.string().optional() });
type Kept = z.infer<typeof schema>;

const listeners = createListeners();
let queue: Promise<unknown> = Promise.resolve();
const read = async (): Promise<Kept> => (await readSecureJson(KEY, schema)) ?? { rentals: {} };

// One change at a time, so two quick changes never lose each other.
function change(update: (kept: Kept) => Kept): Promise<void> {
  const next = queue.then(async () => {
    await writeSecureJson(KEY, update(await read()));
    listeners.notify();
  });
  queue = next.catch(() => undefined);
  return next;
}

export const pushStore = {
  subscribe: listeners.subscribe,
  rental: async (link: string): Promise<RentalPushChoice | undefined> => (await read()).rentals[link],
  rentalsOn: async (): Promise<string[]> => Object.entries((await read()).rentals).flatMap(([link, choice]) => (choice.state === 'on' ? [link] : [])),
  linkFor: async (reference: string): Promise<string | undefined> => Object.entries((await read()).rentals).find(([, choice]) => choice.state === 'on' && choice.reference === reference)?.[0],
  // A rental opened with a newer link registers under the same reference; the older link then lets it go, so a push
  // opens the newest link, whose scopes are the rental's latest.
  setRental: (link: string, choice: RentalPushChoice) =>
    change((kept) => {
      const others = Object.entries(kept.rentals).filter(([each, earlier]) => each !== link && !(choice.state === 'on' && earlier.state === 'on' && earlier.reference === choice.reference));
      return { ...kept, rentals: { ...Object.fromEntries(others), [link]: choice } };
    }),
  forgetRental: (link: string) => change((kept) => ({ ...kept, rentals: Object.fromEntries(Object.entries(kept.rentals).filter(([each]) => each !== link)) })),
  counter: async () => (await read()).counter,
  setCounter: (choice: 'on' | 'off' | undefined) => change(({ counter: _counter, ...kept }) => (choice === undefined ? kept : { ...kept, counter: choice })),
  lastToken: async () => (await read()).lastToken,
  setLastToken: (token: string) => change((kept) => ({ ...kept, lastToken: token })),
};
