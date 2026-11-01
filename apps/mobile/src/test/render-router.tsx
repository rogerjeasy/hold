import type { ReactNode } from 'react';
import { renderRouter } from 'expo-router/testing-library';
import { AppProviders } from '@/components/app-providers';
import { createFakeApi, type FakeApi } from '@/test/fake-api';

type Routes = Parameters<typeof renderRouter>[0];

// Renders a set of routes inside the app's providers, starting at `initialUrl`, to test where a screen leads.
// Routes are named as in src/app, for example '(renter)/rentals'. Expo Router's renderer turns on fake timers.
export async function renderRoutes(routes: Routes, { initialUrl = '/', api = createFakeApi() }: { initialUrl?: string; api?: FakeApi } = {}) {
  const rendering = renderRouter(routes, {
    initialUrl,
    wrapper: ({ children }: { children: ReactNode }) => <AppProviders api={api}>{children}</AppProviders>,
  });
  // React Native Testing Library renders asynchronously; Expo Router hangs its helpers on the promise itself.
  const view = await rendering;
  return Object.assign(view, { api, getPathname: rendering.getPathname, getSegments: rendering.getSegments });
}
