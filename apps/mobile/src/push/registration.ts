import type { ApiClient } from '@/api';
import { actAsRenter } from '@/features/renter-common/renter-api';
import { staffAct } from '@/features/shop-session/staff-request';
import { askForPush, expoPushToken, pushPermission, pushPlatform } from './device';
import { pushStore } from './push-store';

// Registering this phone with Hold for push notifications (architecture.md section 13.9): a renter's for one rental,
// through that rental's link; a member of staff's for the shop they are signed in to. Hold registers only what the
// person turned on, after they read why, and a refusal is kept.

export type TurnedOn = 'on' | 'denied' | 'unavailable' | 'failed';

// The phone's push token, once the person has allowed notifications: asked for now, or already allowed.
async function allowedToken(channelName: string | undefined): Promise<{ readonly token: string; readonly platform: 'ios' | 'android' } | 'denied' | 'unavailable'> {
  const platform = pushPlatform();
  if (platform === undefined) return 'unavailable';
  const permission = channelName === undefined ? await pushPermission() : await askForPush(channelName);
  if (permission !== 'granted') return 'denied';
  const token = await expoPushToken();
  return token === undefined ? 'unavailable' : { token, platform };
}

async function registerRental(api: ApiClient, link: string, phone: { readonly token: string; readonly platform: 'ios' | 'android' }): Promise<boolean> {
  const answer = await actAsRenter(api, link, 'register-push', { pushToken: phone.token, platform: phone.platform });
  if (answer.ok) await pushStore.setRental(link, { state: 'on', reference: answer.value.reference });
  return answer.ok;
}

async function registerCounter(api: ApiClient, locale: string, phone: { readonly token: string; readonly platform: 'ios' | 'android' }): Promise<boolean> {
  return (await staffAct(api, 'register-push', { pushToken: phone.token, platform: phone.platform }, locale)).ok;
}

export async function turnOnRental(api: ApiClient, link: string, channelName: string): Promise<TurnedOn> {
  const phone = await allowedToken(channelName);
  if (phone === 'denied') await pushStore.setRental(link, { state: 'off' });
  if (typeof phone === 'string') return phone;
  if (!(await registerRental(api, link, phone))) return 'failed';
  await pushStore.setLastToken(phone.token);
  return 'on';
}

export const notNowForRental = (link: string) => pushStore.setRental(link, { state: 'off' });

// Hold forgets this phone for the rental; the phone keeps it off even if Hold could not be reached.
export async function turnOffRental(api: ApiClient, link: string): Promise<void> {
  const token = await pushStore.lastToken();
  if (token !== undefined) await actAsRenter(api, link, 'unregister-push', { pushToken: token });
  await pushStore.setRental(link, { state: 'off' });
}

export async function turnOnCounter(api: ApiClient, locale: string, channelName: string): Promise<TurnedOn> {
  const phone = await allowedToken(channelName);
  if (phone === 'denied') await pushStore.setCounter('off');
  if (typeof phone === 'string') return phone;
  if (!(await registerCounter(api, locale, phone))) return 'failed';
  await pushStore.setCounter('on');
  await pushStore.setLastToken(phone.token);
  return 'on';
}

export async function turnOffCounter(api: ApiClient, locale: string): Promise<void> {
  const token = await pushStore.lastToken();
  if (token !== undefined) await staffAct(api, 'unregister-push', { pushToken: token }, locale);
  await pushStore.setCounter('off');
}

// Apple and Google may give the phone a new push token; Expo's then changes too. Each time the app starts, or the
// phone says its token changed, every registration that is on is sent again with the new one. Never asks for anything.
export async function keepPushCurrent(api: ApiClient, locale: string): Promise<void> {
  const links = await pushStore.rentalsOn();
  const counter = (await pushStore.counter()) === 'on';
  if (links.length === 0 && !counter) return;
  const phone = await allowedToken(undefined);
  if (typeof phone === 'string' || phone.token === (await pushStore.lastToken())) return;
  for (const link of links) await registerRental(api, link, phone);
  if (counter) await registerCounter(api, locale, phone);
  await pushStore.setLastToken(phone.token);
}

// A rental removed from this phone: Hold forgets this phone for it, and so does the phone.
export async function forgetRentalPush(api: ApiClient, link: string): Promise<void> {
  const choice = await pushStore.rental(link);
  const token = await pushStore.lastToken();
  if (choice?.state === 'on' && token !== undefined) await actAsRenter(api, link, 'unregister-push', { pushToken: token });
  if (choice !== undefined) await pushStore.forgetRental(link);
}

// What signing out sends so Hold ends this phone's counter registrations with the session, and the counter's choice
// forgotten, so the next person to sign in here is asked their own.
export async function signOutPush(): Promise<{ pushToken?: string }> {
  const counter = await pushStore.counter();
  const token = await pushStore.lastToken();
  await pushStore.setCounter(undefined);
  return counter === 'on' && token !== undefined ? { pushToken: token } : {};
}
