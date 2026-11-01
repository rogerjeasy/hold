import { createContext, use, type ReactNode } from 'react';
import type { ApiClient } from './client';
import { holdApi } from './hold';

// Screens reach Hold through this, so a test can hand them a fake (src/test/fake-api.ts) instead of the network.
const ApiContext = createContext<ApiClient | undefined>(undefined);

export function ApiProvider({ api, children }: { api: ApiClient; children: ReactNode }) {
  return <ApiContext value={api}>{children}</ApiContext>;
}

export function useApi(): ApiClient {
  return use(ApiContext) ?? holdApi();
}
