import { z } from 'zod';
import { createListeners, readSecureJson, writeSecureJson } from './secure-json';

// The rental links this phone has opened, so a renter comes back to a rental without the email. A link is a key to
// the rental, so it lives in the secure store, never in plain storage.
const KEY = 'hold.saved-rentals';
// Enough for anyone's current rentals; it also keeps the value small, as Android's keystore prefers.
const MOST = 10;

const savedRentalSchema = z.object({
  token: z.string().min(1),
  openedAt: z.iso.datetime(),
  // What Hold calls the rental, once a screen has read it: the shop and what was rented.
  title: z.string().optional(),
});
export type SavedRental = z.infer<typeof savedRentalSchema>;
const listSchema = z.array(savedRentalSchema);

const listeners = createListeners();
// One change at a time, so two quick saves never lose each other.
let queue: Promise<unknown> = Promise.resolve();

const list = async (): Promise<SavedRental[]> => (await readSecureJson(KEY, listSchema)) ?? [];

function change(update: (rentals: SavedRental[]) => SavedRental[]): Promise<void> {
  const next = queue.then(async () => {
    await writeSecureJson(KEY, update(await list()).slice(0, MOST));
    listeners.notify();
  });
  queue = next.catch(() => undefined);
  return next;
}

export const savedRentals = {
  list,
  subscribe: listeners.subscribe,
  // Opening a rental puts it first.
  save: (token: string, now: Date) =>
    change((rentals) => {
      const earlier = rentals.find((rental) => rental.token === token);
      return [{ ...earlier, token, openedAt: now.toISOString() }, ...rentals.filter((rental) => rental !== earlier)];
    }),
  name: (token: string, title: string) => change((rentals) => rentals.map((rental) => (rental.token === token ? { ...rental, title } : rental))),
  remove: (token: string) => change((rentals) => rentals.filter((rental) => rental.token !== token)),
};
