# Hold's phone app: instructions for coding agents

The rules in `../../AGENTS.md` apply first: test first, KISS and DRY, money and state, security, code style. This file
says how they apply to the Expo app for iOS and Android. The app has two sides: the **renter**, who acts through
their rental link, and the **counter**, where staff hand items over and photograph returns. It talks only to the web
app's `/api/mobile/v1`, whose contract is `packages/mobile-api`.

## Expo changes fast

This is Expo SDK 57, Expo Router 57, React Native 0.86, React 19.2, NativeWind 4. Check an API in `node_modules` or at
`https://docs.expo.dev/versions/v57.0.0/` before using it; do not write it from memory.

- Add a dependency only with `npx expo install <package>` from this folder, and say why.
- `ios/` and `android/` are generated (`.gitignore`d). Native settings live in `app.config.ts` and config plugins.
- Expo Router: import from `expo-router`, and React Navigation from `expo-router/react-navigation`, never `@react-navigation/*`.

## Commands

```
pnpm mobile                 # from the root: the bundler, for the development build
pnpm test:mobile            # from the root: Jest (also part of pnpm check)
npx tsc --noEmit            # from here
npx jest <path>             # one file or folder
npx eslint .
npx expo run:ios            # builds and installs the development build on a simulator or a device
npx expo run:android
npx expo export --platform ios --output-dir <scratch>   # proves the bundle builds
```

`pnpm` is the workspace's package manager; Expo commands that shell out to it need it on `PATH`.

Set `EXPO_PUBLIC_HOLD_API_URL` in a local `.env` (see `.env.example`): the deployed web app, or
`http://localhost:3000` (`http://10.0.2.2:3000` from the Android emulator). The app throws on its first request
without it, on purpose.

## Where things go

```
src/
  app/                 routes only; a route file renders a screen from features/ and sets its header
    (renter)/          rentals (saved list), add-link (form sheet), scan (modal), r/[token]/ one rental: index, pay,
                       paid, condition, extend, extended, incident/{index,[incidentId]}, return, claim, negotiation,
                       record, trust, assistant (the web's renter paths), contact (the web's panel, as a page)
    shop/              sign-in, choose-shop, account; Stack.Protected on the staff session
      (tabs)/          (today)/, rentals/, drop-offs/: each tab its own stack, for the large title and account button
      rental/[rentalId]/ index, link (QR), message, item/[itemId] (status)
      session/[sessionId]/ index (photograph each view, seal), marks (handover marks)
      review/[comparisonId] the note after a compared return
    +native-intent.tsx turns a universal link or hold:// link into /r/<token>/...; PayPal's hand-back goes nowhere
  features/<feature>/  a screen and the components, hooks and helpers only it uses: renter-* for the renter's
                       screens (renter-common is what several share), shop-* for the counter, photos for uploads
  components/ui/       shared primitives (import from '@/components/ui')
  components/camera/   CameraPermissionGate and ConditionCapture (photographs with the ghost frame)
  api/                 the client, ApiProvider/useApi, useAnswer (four-state loading)
  storage/             secure store: saved rentals and the staff session, with hooks
  push/                push notifications: the one wrapper of expo-notifications, what this phone registered, where a
                       tapped notification leads, and PushResponder at the root (screens in features/push)
  links/               rental link parsing
  i18n/                use-intl provider, locale choice; messages live in ../messages/*.json
  theme/               ThemeProvider (CSS variables per theme), fonts, native header options
  test/                renderWithProviders, renderRoutes, fake API, fake camera
```

**Adding a screen.** Write its test in `src/features/<feature>/`, render it with `renderWithProviders` (a component)
or `renderRoutes` (where it leads), then the screen, then a route file in `src/app/` that only renders it. The renter's
screens mirror the web's renter link: `src/app/(renter)/r/[token]/pay.tsx` and so on, so a link opened from outside
lands on the same page; add each to the `Stack` in `(renter)/_layout.tsx` with its title. Every route under
`r/[token]` is saved on the phone by `useKeepOpenedRental`; read the token with `useLocalSearchParams`.

A screen that scrolls uses `<Screen>`, with its main action in `footer` so it stays above the keyboard and the home
indicator. Titles come from the native header (`title` in the layout), not from a text on the page. A full-screen
camera hides the header.

## Reading from and writing to Hold

```tsx
const { state, retry } = useAnswer(token, (api) => api.request('renter/rental', renterRentalSchema, { bearer: token }));
return <LoadState state={state} onRetry={retry} empty={{ title, body }} isEmpty={...}>{(rental) => ...}</LoadState>;
```

- `api.request(path, schema, { bearer, shopId, body })`: path is relative to `MOBILE_API_BASE`; a `body` makes it a
  POST. The schema is the contract's, from `@hold/mobile-api`, never one written here.
- It never throws. It resolves to `{ ok: true, value }` or `{ ok: false, failure }`, where failure is one of the
  contract's `FAILURES` or `offline`, `timeout`, `unexpected`. Every failure has a title and body under `loadState` in
  the messages; `LoadState` shows them and offers a retry only where trying again can help.
- The renter's bearer is the rental token. Staff send the access token from `staffSession` and the shop id.
- Amounts arrive as integer cents beside a currency: show them with `<MoneyText money={{ cents, currency }} />`, which
  uses `formatMoney` from `@hold/domain`. Never compute or round money here.
- A money decision is never made by the phone alone: accepting or contesting a claim needs the one-time code
  (`<CodeInput length={8} />`); approving a charge needs a passkey on the web.

## Look and text

- Only token classes exist: colours (`bg-card`, `text-muted-foreground`, `border-border-strong`, `bg-primary`), type
  (`text-title` with `font-display`, or better `<Text variant="title">`), radii (`rounded-lg`). They come from
  `@hold/design-tokens`, which a test keeps equal to the web's `globals.css`. A hex value fails lint. An opacity
  modifier (`bg-primary/50`) does not work, because colours are CSS variables that flip with the theme.
- A raw colour, for a native prop such as `tintColor` or a spinner, comes from `useTheme().color`.
- Text: `<Text variant tone>` only. It follows the phone's text size; never turn that off, let the layout grow.
- Icons: `<Icon name>` from the list in `components/ui/icon.tsx`, SF Symbols on iOS and Material Symbols on Android.
  Add a name there with both glyphs; an icon never carries meaning alone.
- Every control is at least 44 points (`min-h-touch`), has a role and a label, and states busy or disabled.
- Native idioms: the platform's header, back gesture, tab bar (`NativeTabs`), sheets (`presentation: 'formSheet'`),
  context menus (`Link.Menu` on iOS). No hand-made headers, no floating tab bar, no web-style centred dialogs.
- Anything simulated for the demo carries `<SampleLabel />` (or `kind="simulated"`).
- All fixed text comes from `messages/{en,fr,de,es}.json` with `useTranslations`. Keys are typed: a missing English key
  does not compile, and a test fails when another language misses a key or a placeholder.
- Notifications are offered only from a card that says why (`features/push`), never at launch; a refusal is kept. A
  push's data is untrusted: it opens only what `src/push/push-route.ts` allows. The EAS project id is in `app.config.ts`;
  an Android build also needs `GOOGLE_SERVICES_JSON` to get a push token.
- Check each screen at a small phone (360 points), a large phone and a tablet, portrait and landscape, light and dark.

## Tests

| Code | Test with |
|---|---|
| Pure helpers (links, downscale) | Plain Jest tests |
| Stores, the client | Jest with the secure-store mock and a fake `fetch` |
| Components and screens | `renderWithProviders` and Testing Library queries by role and label |
| Navigation | `renderRoutes` and `getPathname()` |
| The camera | `jest.mock('expo-camera', () => jest.requireActual('@/test/fake-camera').fakeCamera)` |

- React Native Testing Library 14 is asynchronous: `await render(...)`, `await fireEvent.press(...)`. An unawaited
  event races the assertion.
- `renderRoutes` turns on fake timers (Expo Router's renderer does).
- `jest.setup.ts` resets the secure store and the phone's language before each test, and mocks haptics and the
  keyboard. A test changes the language with `jest.mocked(useLocales).mockReturnValue(...)`.

## Links into the app

- `hold://r/<token>` works in any build (`scheme: 'hold'`).
- `https://<host>/r/<token>` and `https://<host>/<locale>/r/<token>` open the app only when `EXPO_PUBLIC_HOLD_API_URL`
  is https at build time (`app.config.ts` then adds `applinks:<host>` and an Android `autoVerify` intent filter) and
  the web app serves, at `https://<host>/.well-known/`:
  - `apple-app-site-association` (JSON, no extension, `application/json`), with `applinks.details` naming
    `<TeamID>.com.rogerjeasy.hold` and paths `/r/*` and `/*/r/*`;
  - `assetlinks.json` naming the package `com.rogerjeasy.hold` and the SHA-256 fingerprint of its signing key.
  Neither file exists yet; they belong in `apps/web`. Until then a link opens the web page, and the app is reached by
  scanning or pasting.

## Running on a phone

`npx expo run:ios` needs Xcode with an iOS simulator runtime (`xcodebuild -downloadPlatform iOS` installs one), or a
plugged-in iPhone. `npx expo run:android` needs Android Studio's SDK with an emulator, or a device. The app uses a native
module Expo Go does not have (`react-native-keyboard-controller`), so it runs as a development build, not in Expo Go. `npx expo export --platform web` gives a rough preview for layout checks only; the secure store
and the camera do not work there.
