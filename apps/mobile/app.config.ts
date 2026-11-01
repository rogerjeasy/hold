import type { ExpoConfig } from 'expo/config';
import { color } from '@hold/design-tokens';

// Expo app config. Nothing here is a secret. Per-environment values (the Hold address) come from EXPO_PUBLIC_*
// variables in a local, gitignored .env (see .env.example).
const STORE_BUNDLE_ID = 'com.rogerjeasy.hold';
// A development build is its own app, so it installs next to the store app.
const IS_DEV_BUILD = process.env.APP_VARIANT === 'development';
const BUNDLE_ID = IS_DEV_BUILD ? `${STORE_BUNDLE_ID}.dev` : STORE_BUNDLE_ID;

// Shown by iOS in the camera prompt. The camera takes the condition photographs at pickup and return, and reads the
// shop's code at the counter, nothing else.
const CAMERA_REASON =
  "Hold uses the camera to photograph an item when it is handed over and when it comes back, so both sides have the same record, and to scan the shop's rental code.";

// Renter links are https://<host>/r/<token> and https://<host>/<locale>/r/<token> on the web app this build talks to.
// The phone opens them itself only when that host is https and serves the association files (apps/mobile/AGENTS.md).
const linkHost = /^https:\/\/([^/]+)/.exec(process.env.EXPO_PUBLIC_HOLD_API_URL ?? '')?.[1];

// The EAS project that builds the app and that Expo issues push tokens for (architecture.md section 13.9), made with
// `eas init` on 1 November 2026. A project id is not a secret.
const EAS_PROJECT_ID = '5967e779-d0d4-49c3-a400-137703fa4d31';
// Android receives pushes through Firebase Cloud Messaging, which needs the Firebase project's google-services.json
// in the build: its path, from an EAS file variable. Without it an Android build gets no push token.
const GOOGLE_SERVICES_FILE = process.env.GOOGLE_SERVICES_JSON;

const config: ExpoConfig = {
  name: IS_DEV_BUILD ? 'Hold Dev' : 'Hold',
  slug: 'hold',
  owner: 'rogerjeasy',
  scheme: 'hold',
  version: '0.1.0',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: true,
    config: { usesNonExemptEncryption: false },
    ...(linkHost ? { associatedDomains: [`applinks:${linkHost}`] } : {}),
  },
  android: {
    package: BUNDLE_ID,
    predictiveBackGestureEnabled: false,
    ...(GOOGLE_SERVICES_FILE ? { googleServicesFile: GOOGLE_SERVICES_FILE } : {}),
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/monochrome-icon.png',
      backgroundColor: color.light.foreground,
    },
    ...(linkHost
      ? {
          intentFilters: [
            {
              action: 'VIEW',
              autoVerify: true,
              data: [
                { scheme: 'https', host: linkHost, pathPrefix: '/r/' },
                { scheme: 'https', host: linkHost, pathPattern: '/../r/.*' },
              ],
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ],
        }
      : {}),
  },
  web: { bundler: 'metro', output: 'single', favicon: './assets/favicon.png' },
  extra: { eas: { projectId: EAS_PROJECT_ID } },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-secure-store',
    'expo-localization',
    'expo-web-browser',
    'expo-image',
    // Android tints the silhouette with Hold's primary colour; the one channel is created, in the person's language,
    // before the app first asks (src/push/device.ts). iOS's push entitlement follows the build.
    ['expo-notifications', { icon: './assets/monochrome-icon.png', color: color.light.primary, defaultChannel: 'default', mode: IS_DEV_BUILD ? 'development' : 'production' }],
    ['expo-camera', { cameraPermission: CAMERA_REASON, microphonePermission: false, recordAudioAndroid: false, barcodeScannerEnabled: true }],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 120,
        backgroundColor: color.light.background,
        dark: { image: './assets/splash-icon-dark.png', backgroundColor: color.dark.background },
      },
    ],
  ],
  experiments: { typedRoutes: true },
};

export default config;
