import { useEffect, useState } from 'react';
import { savedRentals, type SavedRental } from './saved-rentals';

// The rentals this phone keeps, kept current as they change. Undefined while the device store is first read.
export function useSavedRentals(): readonly SavedRental[] | undefined {
  const [rentals, setRentals] = useState<readonly SavedRental[] | undefined>(undefined);
  useEffect(() => {
    let open = true;
    const read = () => void savedRentals.list().then((list) => open && setRentals(list));
    read();
    const stop = savedRentals.subscribe(read);
    return () => {
      open = false;
      stop();
    };
  }, []);
  return rentals;
}
