import { useState } from 'react';
import { useLocale } from 'use-intl';
import { signInStartedSchema, staffTokensSchema } from '@hold/mobile-api';
import { useApi, type Answer, type ClientFailure } from '@/api';
import { staffSession } from '@/storage/staff-session';
import { expiresAt } from './staff-request';

// Signing in with the code Hold emails, in the web's two steps (architecture.md section 13.7): the address, then the
// code. The attempt between them is sealed by Hold; the phone only carries it back.

export const CODE_LENGTH = 8;

// What went wrong, in the words of the web's sign-in. A failure before Hold answered is shown as the app shows it
// everywhere (offline, timeout).
export type SignInProblem =
  | 'emailMissing'
  | 'emailInvalid'
  | 'codeMissing'
  | 'codeInvalid'
  | 'wrong'
  | 'expired'
  | 'attempt_over'
  | 'second_factor'
  | 'busy'
  | 'unavailable'
  | { readonly failure: ClientFailure };

type Step = { readonly name: 'email' } | { readonly name: 'code'; readonly email: string; readonly attempt: string; readonly resent: boolean };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_REASONS = ['wrong', 'expired', 'attempt_over', 'second_factor', 'unavailable'] as const;

function problemOf(failed: Extract<Answer<unknown>, { ok: false }>, field: 'email' | 'code'): SignInProblem {
  if (failed.failure === 'rate_limited') return 'busy';
  if (failed.failure === 'invalid') return field === 'email' ? 'emailInvalid' : 'codeInvalid';
  if (failed.failure === 'refused') return CODE_REASONS.find((reason) => reason === failed.reason) ?? 'unavailable';
  return { failure: failed.failure };
}

export function useSignIn() {
  const api = useApi();
  const locale = useLocale();
  const [step, setStep] = useState<Step>({ name: 'email' });
  const [problem, setProblem] = useState<SignInProblem | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(undefined);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (typed: string, resending = false) =>
    run(async () => {
      const email = typed.trim();
      if (email === '') return setProblem('emailMissing');
      if (!EMAIL.test(email) || email.length > 254) return setProblem('emailInvalid');
      const started = await api.request('session/start', signInStartedSchema, { body: { email, locale } });
      if (!started.ok) return setProblem(problemOf(started, 'email'));
      setStep({ name: 'code', email, attempt: started.value.attempt, resent: resending });
    });

  const verify = (code: string) =>
    run(async () => {
      if (step.name !== 'code') return;
      if (code === '') return setProblem('codeMissing');
      if (code.length !== CODE_LENGTH) return setProblem('codeInvalid');
      const tokens = await api.request('session/verify', staffTokensSchema, { body: { attempt: step.attempt, code } });
      if (!tokens.ok) return setProblem(problemOf(tokens, 'code'));
      await staffSession.write({ accessToken: tokens.value.accessToken, refreshToken: tokens.value.refreshToken, expiresAt: expiresAt(new Date(), tokens.value.expiresInSeconds) });
    });

  const startOver = () => {
    setProblem(undefined);
    setStep({ name: 'email' });
  };

  return { step, problem, busy, sendCode, verify, startOver };
}
