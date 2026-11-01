import { useEffect } from 'react';
import { useGlobalSearchParams } from 'expo-router';
import { savedRentals } from '@/storage/saved-rentals';

// Whichever way a rental was opened (a link from outside, a pasted link, a scanned code, the saved list), its link is
// kept on this phone, so the renter comes back to it without the email.
export function useKeepOpenedRental() {
  const { token } = useGlobalSearchParams<{ token?: string }>();
  useEffect(() => {
    if (typeof token === 'string' && token !== '') void savedRentals.save(token, new Date());
  }, [token]);
}
