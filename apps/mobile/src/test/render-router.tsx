import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { AppProviders } from '@/components/app-providers';
import { createFakeApi, type FakeApi } from '@/test/fake-api';

type Routes = Parameters<typeof renderRouter>[0];

// Every route and layout file in src/app, named as Expo Router names them ('(renter)/r/[token]/pay'), without the
// special files (+native-intent, +not-found), which are not screens of a layout.
const APP = join(__dirname, '..', 'app');
const APP_FILES = readdirSync(APP, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.tsx') && !file.split('/').some((part) => part.startsWith('+')))
  .map((file) => file.slice(0, -'.tsx'.length));

const NoScreen = () => null;
const PassThrough = () => <Slot />;

// A layout names each of its screens, and a test renders it with only the routes it is about. The layout's other
// screens are filled in as empty routes, and the layouts between them as plain slots, so the router sees the app's
// whole tree under that layout, as the app does, instead of warning about every screen the test left out.
function withTheRestOfTheApp(routes: Routes): Routes {
  if (routes === undefined || typeof routes === 'string' || Array.isArray(routes) || 'appDir' in routes) return routes;
  // A group adds nothing to an address, and 'rental/[rentalId]/index' is 'rental/[rentalId]': a route the test gives at
  // the same address as an app file counts as that file, so no two screens share one address.
  const screen = (name: string) => name.replace(/\([^/]+\)\//g, '').replace(/(^|\/)index$/, '');
  const given = new Set(Object.keys(routes).map(screen));
  const under = Object.keys(routes).filter((name) => name === '_layout' || name.endsWith('/_layout')).map((layout) => layout.slice(0, -'_layout'.length));
  const missing = APP_FILES.filter((file) => !given.has(screen(file)) && file !== '_layout' && under.some((folder) => file.startsWith(folder)));
  return { ...Object.fromEntries(missing.map((file) => [file, file.endsWith('_layout') ? PassThrough : NoScreen])), ...routes };
}

// Renders a set of routes inside the app's providers, starting at `initialUrl`, to test where a screen leads.
// Routes are named as in src/app, for example '(renter)/rentals'. Expo Router's renderer turns on fake timers.
export async function renderRoutes(routes: Routes, { initialUrl = '/', api = createFakeApi() }: { initialUrl?: string; api?: FakeApi } = {}) {
  const rendering = renderRouter(withTheRestOfTheApp(routes), {
    initialUrl,
    wrapper: ({ children }: { children: ReactNode }) => <AppProviders api={api}>{children}</AppProviders>,
  });
  // React Native Testing Library renders asynchronously; Expo Router hangs its helpers on the promise itself.
  const view = await rendering;
  return Object.assign(view, { api, getPathname: rendering.getPathname, getSegments: rendering.getSegments });
}
