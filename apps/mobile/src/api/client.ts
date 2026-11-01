import { z } from 'zod';
import { answerSchema, MOBILE_API_BASE, SHOP_HEADER, type Failure } from '@hold/mobile-api';

// How the phone talks to Hold's /api/mobile/v1 routes. Every request resolves to an answer, never a throw: Hold's own
// refusals come back as Hold sent them, and the three ways a request can fail before Hold answers have names of their
// own, so a screen can say what happened and that nothing was changed.
export type TransportFailure = 'offline' | 'timeout' | 'unexpected';
export type ClientFailure = Failure | TransportFailure;

export type Answer<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly failure: ClientFailure; readonly fields?: readonly string[]; readonly reason?: string };

export type RequestOptions = {
  // A body makes the request a POST; requests that change something are never GET (AGENTS.md section 7).
  readonly body?: Readonly<Record<string, unknown>>;
  // The renter's link token, or the staff member's access token.
  readonly bearer?: string;
  // The shop a staff request acts in.
  readonly shopId?: string;
};

export type ApiClient = {
  request<Value>(path: string, schema: z.ZodType<Value>, options?: RequestOptions): Promise<Answer<Value>>;
};

type ClientSettings = {
  readonly baseUrl: string;
  readonly fetch: typeof globalThis.fetch;
  // Long enough for a phone on a weak signal, short enough that nobody stares at a spinner.
  readonly timeoutMs: number;
  // Hold answers in the phone's language.
  readonly locale: () => string;
};

const failedBefore = (failure: TransportFailure): Answer<never> => ({ ok: false, failure });

export function createApiClient({ baseUrl, fetch, timeoutMs, locale }: ClientSettings): ApiClient {
  return {
    async request(path, schema, { body, bearer, shopId } = {}) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      const headers: Record<string, string> = { accept: 'application/json', 'accept-language': locale() };
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (bearer !== undefined) headers.authorization = `Bearer ${bearer}`;
      if (shopId !== undefined) headers[SHOP_HEADER] = shopId;
      try {
        const response = await fetch(`${baseUrl}${MOBILE_API_BASE}/${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: abort.signal,
        });
        const parsed = answerSchema(schema).safeParse(await response.json());
        // An answer of the wrong shape is never shown as if it were right. Only its paths are logged, never its values.
        if (!parsed.success) {
          if (__DEV__) console.warn(`Hold's answer to ${path} did not match the contract at`, parsed.error.issues.map((issue) => issue.path.join('.')));
          return failedBefore('unexpected');
        }
        return parsed.data as Answer<z.infer<typeof schema>>;
      } catch (error) {
        if (abort.signal.aborted) return failedBefore('timeout');
        // fetch rejects with a TypeError when the request never reached a server; anything else is a page that is not JSON.
        return failedBefore(error instanceof TypeError ? 'offline' : 'unexpected');
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
