import type { RentalState } from '@hold/domain';
import type { RenterView } from '@hold/mobile-api';

// How Hold reaches the renter, as their screens read it (architecture.md section 12.3).
export type RenterContact = NonNullable<RenterView<'rental'>['contact']>;

const OVER: ReadonlySet<RentalState> = new Set(['closed', 'cancelled', 'abandoned']);

// On the rental while it is not over and not a sample, as on the web.
export const contactOnRental = (rental: RenterView<'rental'>): RenterContact | undefined =>
  rental.contact !== null && !OVER.has(rental.view.state) && !rental.view.simulated ? rental.contact : undefined;

// On the hold until it is placed; after that a new number is a change, made from the rental.
export const contactOnHold = (hold: RenterView<'hold'>): RenterContact | undefined => (hold.contact !== null && !hold.contact.locked ? hold.contact : undefined);
