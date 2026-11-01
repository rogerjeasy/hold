import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { z } from 'zod';
import { ApiProvider, useAnswer, type Answer } from '@/api';
import { createFakeApi } from '@/test/fake-api';

const rental = z.object({ shopName: z.string() });

// An answer the test hands over when it chooses.
function held() {
  let settle: (answer: Answer<unknown>) => void = () => undefined;
  const promise = new Promise<Answer<unknown>>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

function wrapperWith(api: ReturnType<typeof createFakeApi>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ApiProvider api={api}>{children}</ApiProvider>;
  };
}

describe('loading an answer for a screen', () => {
  it('is loading, then ready with the value', async () => {
    const reply = held();
    const api = createFakeApi({ 'renter/rental': () => reply.promise });
    const { result } = await renderHook(() => useAnswer('rental', (client) => client.request('renter/rental', rental)), { wrapper: wrapperWith(api) });
    expect(result.current.state).toEqual({ status: 'loading' });
    await act(async () => reply.settle({ ok: true, value: { shopName: 'Velo' } }));
    expect(result.current.state).toEqual({ status: 'ready', value: { shopName: 'Velo' }, refreshing: false });
  });

  it('says why it failed, and loads again on retry', async () => {
    let answer: Answer<unknown> = { ok: false, failure: 'offline' };
    const api = createFakeApi({ 'renter/rental': () => answer });
    const { result } = await renderHook(() => useAnswer('rental', (client) => client.request('renter/rental', rental)), { wrapper: wrapperWith(api) });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'failed', failure: 'offline' }));
    answer = { ok: true, value: { shopName: 'Velo' } };
    await act(async () => result.current.retry());
    expect(result.current.state).toEqual({ status: 'ready', value: { shopName: 'Velo' }, refreshing: false });
    expect(api.calls.map((call) => call.path)).toEqual(['renter/rental', 'renter/rental']);
  });

  it('keeps showing what it has while it loads again', async () => {
    let reply = held();
    const api = createFakeApi({ 'renter/rental': () => reply.promise });
    const { result } = await renderHook(() => useAnswer('rental', (client) => client.request('renter/rental', rental)), { wrapper: wrapperWith(api) });
    await act(async () => reply.settle({ ok: true, value: { shopName: 'Velo' } }));
    reply = held();
    await act(async () => result.current.retry());
    expect(result.current.state).toEqual({ status: 'ready', value: { shopName: 'Velo' }, refreshing: true });
    await act(async () => reply.settle({ ok: true, value: { shopName: 'Velo Zürich' } }));
    expect(result.current.state).toEqual({ status: 'ready', value: { shopName: 'Velo Zürich' }, refreshing: false });
  });
});
