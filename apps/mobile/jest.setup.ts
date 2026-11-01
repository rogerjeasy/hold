import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

// Reanimated 4 runs worklets on a separate runtime; in Jest they run synchronously on JS.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/lib/module/mock'));
jest.requireActual('react-native-reanimated').setUpTests();

// The keyboard follows the real one natively; in Jest its views are plain views.
jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

// Haptics are felt, not seen; a test checks that one was asked for.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// A Link with a context menu draws through Expo Router's native preview view on iOS, which Jest does not have and which
// would otherwise render nothing: here it shows its trigger, and the menu itself stays native.
jest.mock('expo-router/build/link/preview/native', () => {
  const actual = jest.requireActual('expo-router/build/link/preview/native');
  const { View } = jest.requireActual('react-native');
  const { createElement } = jest.requireActual('react');
  return { ...actual, NativeLinkPreview: ({ children }: { children: unknown }) => createElement(View, null, children) };
});

// The device store is an in-memory map in tests.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
    __reset: () => store.clear(),
  };
});

// The phone's languages and time zone; a test can change them with jest.mocked(useLocales).mockReturnValue(...).
jest.mock('expo-localization', () => {
  const locales = () => [{ languageCode: 'en', languageTag: 'en-US' }];
  const calendars = () => [{ timeZone: 'Europe/Zurich' }];
  const mocks = { getLocales: jest.fn(), useLocales: jest.fn(), getCalendars: jest.fn(), useCalendars: jest.fn() };
  const reset = () => {
    mocks.getLocales.mockImplementation(locales);
    mocks.useLocales.mockImplementation(locales);
    mocks.getCalendars.mockImplementation(calendars);
    mocks.useCalendars.mockImplementation(calendars);
  };
  reset();
  return { ...mocks, __reset: reset };
});

// Push notifications: nothing is allowed and no notification was tapped until a test says so (src/push).
jest.mock('expo-notifications', () => {
  const denied = { granted: false, canAskAgain: true, status: 'undetermined', expires: 'never' };
  return {
    getPermissionsAsync: jest.fn(async () => denied),
    requestPermissionsAsync: jest.fn(async () => denied),
    getExpoPushTokenAsync: jest.fn(async () => ({ type: 'expo', data: 'ExponentPushToken[test-phone]' })),
    setNotificationChannelAsync: jest.fn(async () => null),
    setNotificationHandler: jest.fn(),
    addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
    useLastNotificationResponse: jest.fn(() => null),
    DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
    AndroidImportance: { DEFAULT: 3 },
    IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  };
});

// Each test starts from an English phone and an empty device store.
beforeEach(() => {
  jest.clearAllMocks();
  jest.requireMock('expo-localization').__reset();
  jest.requireMock('expo-secure-store').__reset();
});
