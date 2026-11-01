import { useStaffSession } from '@/storage/use-staff-session';

// Changes when another person signs in on this phone or the shop changes, so what a screen read is read again; it
// stays the same when the access token is only renewed.
export function useSessionKey(): string {
  const session = useStaffSession();
  return session.status === 'signed_in' ? `${session.session.shopId ?? 'no-shop'}:${session.session.refreshToken.slice(-16)}` : session.status;
}
