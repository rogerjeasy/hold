import { useEffect, useState } from 'react';
import { staffSession, type StaffSession } from './staff-session';

export type SessionState = { readonly status: 'reading' } | { readonly status: 'signed_out' } | { readonly status: 'signed_in'; readonly session: StaffSession };

// Whether someone is signed in on this phone, kept current as they sign in and out.
export function useStaffSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'reading' });
  useEffect(() => {
    let open = true;
    const read = () =>
      void staffSession.read().then((session) => {
        if (open) setState(session ? { status: 'signed_in', session } : { status: 'signed_out' });
      });
    read();
    const stop = staffSession.subscribe(read);
    return () => {
      open = false;
      stop();
    };
  }, []);
  return state;
}
