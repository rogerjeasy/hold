import type { Answer, ApiClient, RequestOptions } from '@/api';

type Reply = Answer<unknown> | ((options: RequestOptions) => Answer<unknown> | Promise<Answer<unknown>>);

// Hold's API in a test: each path answers what the test says, and every request is remembered. A path the test did not
// set answers not_found, as Hold would. A reply can be a promise the test settles, to see a screen while it waits. A value is still parsed by the screen's schema, as the real client does.
export function createFakeApi(replies: Readonly<Record<string, Reply>> = {}) {
  const calls: { path: string; options: RequestOptions }[] = [];
  const api: ApiClient & { calls: typeof calls } = {
    calls,
    async request(path, schema, options = {}) {
      calls.push({ path, options });
      const reply = replies[path];
      const answer = typeof reply === 'function' ? await reply(options) : (reply ?? { ok: false, failure: 'not_found' });
      if (!answer.ok) return answer;
      const parsed = schema.safeParse(answer.value);
      return parsed.success ? { ok: true, value: parsed.data } : { ok: false, failure: 'unexpected' };
    },
  };
  return api;
}

export type FakeApi = ReturnType<typeof createFakeApi>;
