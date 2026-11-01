import { useFormatter } from 'use-intl';

// Times on a rental are the shop's, in its own time zone, in the phone's language: a return deadline means the same
// hour to the renter and to the counter.
export function useShopTime(timeZone: string) {
  const format = useFormatter();
  const at = (iso: string) => new Date(iso);
  return {
    when: (iso: string) => format.dateTime(at(iso), { dateStyle: 'medium', timeStyle: 'short', timeZone }),
    date: (iso: string) => format.dateTime(at(iso), { dateStyle: 'medium', timeZone }),
    time: (iso: string) => format.dateTime(at(iso), { timeStyle: 'short', timeZone }),
    relative: (iso: string, now: string) => format.relativeTime(at(iso), at(now)),
  };
}
