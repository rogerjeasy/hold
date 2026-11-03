import { sql } from 'drizzle-orm'
import { rentals, renters } from './schema/index.ts'

// The name a rental goes by on every staff screen: the one staff booked it under, or, when none was given, the name
// PayPal gave for who paid. A query using it joins renters on the rental's renter, as the queries that name one do.
// PayPal's name stays its own fact beside it ("Renter, as PayPal names them").
export const rentalName = sql<string | null>`coalesce(nullif(${rentals.contactName}, ''), ${renters.name})`

// The same rule for a rental already read: the booked name first, PayPal's when none was given.
export function nameOfRental(booked: string | null, paypal: string | null): string | null {
  return booked !== null && booked !== '' ? booked : paypal
}
