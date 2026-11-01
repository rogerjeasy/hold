import { useEffect, useRef } from 'react';
import { router, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useLocale } from 'use-intl';
import { useApi } from '@/api';
import { staffSession } from '@/storage/staff-session';
import { pushPlatform } from './device';
import { pushTarget } from './push-route';
import { keepPushCurrent } from './registration';

// Mounted once at the root (architecture.md section 13.9): opens the screen a tapped notification names, whether it
// started the app or found it running, and keeps this phone's registrations current when its push token changes.
// Asks for nothing: permission is asked only from a screen that says why (features/push). Renders nothing where the
// phone has no push notifications, such as the web build, whose notifications module lacks what this reads.
export function PushResponder() {
  return pushPlatform() === undefined ? null : <ListeningPushResponder />;
}

function ListeningPushResponder() {
  const api = useApi();
  const locale = useLocale();
  const response = Notifications.useLastNotificationResponse();
  const opened = useRef<string | undefined>(undefined);

  // A notification that arrives while the app is open shows as a banner, quietly.
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: () => Promise.resolve({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
  }, []);

  useEffect(() => {
    if (response == null || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const identifier = response.notification.request.identifier;
    if (opened.current === identifier) return;
    opened.current = identifier;
    void pushTarget(response.notification.request.content.data).then(async (target) => {
      if (target === undefined) return;
      if (target.shopId !== undefined) {
        // A person in two shops opens it in the shop it came from; Hold still checks they work there.
        const session = await staffSession.read();
        if (session !== undefined && session.shopId !== target.shopId) await staffSession.write({ ...session, shopId: target.shopId });
      }
      router.push(target.href as Href);
    });
  }, [response]);

  useEffect(() => {
    void keepPushCurrent(api, locale);
    const subscription = Notifications.addPushTokenListener(() => void keepPushCurrent(api, locale));
    return () => subscription.remove();
  }, [api, locale]);

  return null;
}
