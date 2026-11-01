import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import type { PushPlatform } from '@hold/domain';

// The phone's side of push notifications, the one place that talks to expo-notifications for them. Nothing here asks
// for permission on its own: a screen asks once the person has read why (features/push).

export type PushPermission = 'granted' | 'denied' | 'undetermined';

// Android delivers every notification on a channel; Hold uses one, named in the person's language.
export const PUSH_CHANNEL = 'default';

export const pushPlatform = (): PushPlatform | undefined => (Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : undefined);

// Whether this build can receive notifications at all: a phone, and a build that names its EAS project. Without both,
// the app offers none.
export const pushAvailable = (): boolean => pushPlatform() !== undefined && readProjectId() !== undefined;

const permissionOf = (status: Notifications.NotificationPermissionsStatus): PushPermission =>
  status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ? 'granted' : status.canAskAgain ? 'undetermined' : 'denied';

export async function pushPermission(): Promise<PushPermission> {
  if (pushPlatform() === undefined) return 'denied';
  return permissionOf(await Notifications.getPermissionsAsync());
}

// Asks the phone, which shows its own prompt only the first time; a refusal is final until the person changes it in
// Settings. On Android 13 and later the channel must exist before the prompt can show.
export async function askForPush(channelName: string): Promise<PushPermission> {
  if (pushPlatform() === undefined) return 'denied';
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(PUSH_CHANNEL, { name: channelName, importance: Notifications.AndroidImportance.DEFAULT });
  return permissionOf(await Notifications.requestPermissionsAsync());
}

// Expo issues push tokens per EAS project, so a build without its project id has none to give. A simulator, or a phone
// that cannot reach Apple or Google, has none either.
export async function expoPushToken(projectId: string | undefined = readProjectId()): Promise<string | undefined> {
  if (projectId === undefined) {
    if (__DEV__) console.warn('No EAS project id in the app config, so this build offers no push notifications.');
    return undefined;
  }
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return undefined;
  }
}

function readProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id !== '' ? id : undefined;
}
