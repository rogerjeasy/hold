'use server'

import { z } from 'zod'
import { readLocale } from '@/features/auth/locale-input'
import { bookingFields, placeBooking } from '@/server/booking'
import { Refusal } from '@/server/action'
import { shopPageAction } from '@/server/shop-page-access'

// What someone does on a shop's own page, with nobody signed in. Built by shopPageAction, which rate limits the
// network and finds the shop by its address. A test checks that this file exports nothing else.

export const bookOnShopPage = shopPageAction(
  { name: 'rental.booked_on_shop_page', input: z.object({ ...bookingFields, shop: z.string().min(1).max(80), locale: z.string().max(5) }).strict() },
  async (shop, input, transaction) => {
    const placed = await placeBooking(transaction, shop, input, { contact: undefined, language: readLocale(input.locale), bookedThrough: 'shop_page' })
    // The renter goes straight to their link, where they see the terms and pay the fee.
    return placed instanceof Refusal ? placed : { url: placed.path }
  },
)
