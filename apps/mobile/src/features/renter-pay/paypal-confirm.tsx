import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslations } from 'use-intl';
import type { RenterActionInput, RenterActionOutput, RenterView, RenterViewName } from '@hold/mobile-api';
import { useAnswer } from '@/api';
import { Button, Icon, Screen, Text } from '@/components/ui';
import { actAsRenter, useLookAgain, useRenterView } from '@/features/renter-common';
import { RenterRefusal } from '@/features/renter-rental/renter-refusal';
import { useTheme } from '@/theme';
import { usePayPalApproval, type PayPalStart } from './use-paypal-approval';

type ConfirmAction = 'confirm-fee' | 'confirm-hold' | 'confirm-extension';

type PayPalConfirmProps<Confirm extends ConfirmAction, Name extends RenterViewName> = {
  token: string;
  orderId: string;
  // The renter left PayPal's page without PayPal sending them back.
  closed: boolean;
  confirm: Confirm;
  // Starts the same payment again, when PayPal has not approved it.
  start: PayPalStart;
  // True while the worker still carries out what the renter approved; the view is then read until it shows it done.
  stillWorking: (output: RenterActionOutput<Confirm>) => boolean;
  view: Name;
  isDone: (value: RenterView<Name>) => boolean;
  // PayPal holds what was approved for review, which may take days: said plainly, and not looked at again.
  held?: { readonly when: (output: RenterActionOutput<Confirm>) => boolean; readonly text: string };
  texts: { readonly checking: string; readonly done: string };
  next: { readonly href: Href; readonly label: string };
  // Refusals after which the renter approves again in PayPal at once, besides "not approved".
  reopenOn?: readonly string[];
  // Refusals after which the renter should go elsewhere first, such as choosing the days again.
  elsewhere?: { readonly href: Href; readonly label: string; readonly reasons: readonly string[] };
  againLabel?: string;
  wording?: Readonly<Record<string, string>>;
  // A new order to confirm, after PayPal was opened again from here.
  onReopened: (orderId: string, closed: boolean) => void;
};

// Back from PayPal: Hold is asked, once, to carry out the order the renter was given, and reads it back from PayPal
// itself, so nothing is recorded for an order PayPal does not show approved. While the worker acts, the screen looks
// again; when PayPal has not approved it, the renter opens PayPal again from here (the web's PayPal return page).
export function PayPalConfirm<Confirm extends ConfirmAction, Name extends RenterViewName>(props: PayPalConfirmProps<Confirm, Name>) {
  const { token, orderId, closed, confirm, start, stillWorking, view, isDone, held, texts, next, reopenOn = [], elsewhere, againLabel, wording = {}, onReopened } = props;
  const t = useTranslations('pay');
  const { color } = useTheme();
  const confirmed = useAnswer(`${confirm}:${token}:${orderId}`, (api) => actAsRenter(api, token, confirm, { orderId } as RenterActionInput<Confirm>));
  const output = confirmed.state.status === 'ready' && !confirmed.state.refreshing ? (confirmed.state.value as RenterActionOutput<Confirm>) : undefined;
  const reviewing = output !== undefined && held?.when(output) === true;
  const working = output !== undefined && !reviewing && stillWorking(output);
  const read = useRenterView(token, view);
  useLookAgain(working, read.retry);
  const shownDone = working && read.state.status === 'ready' && isDone(read.state.value);
  const finished = output !== undefined && !reviewing && (!working || shownDone);
  const paypal = usePayPalApproval(token, start, onReopened);

  useEffect(() => {
    if (finished) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [finished]);

  const goNext = () => router.dismissTo(next.href);
  const failed = confirmed.state.status === 'failed' ? { ok: false as const, failure: confirmed.state.failure, ...(confirmed.state.reason === undefined ? {} : { reason: confirmed.state.reason }) } : undefined;
  const reason = failed?.failure === 'refused' ? failed.reason?.split(':')[0] : undefined;
  const reopen = reason === 'not_approved' || (reason !== undefined && reopenOn.includes(reason));
  const goElsewhere = reason !== undefined && elsewhere?.reasons.includes(reason) === true ? elsewhere : undefined;

  const footer = finished || reviewing ? (
    <Button label={next.label} icon="forward" onPress={goNext} />
  ) : failed ? (
    <>
      {paypal.failed ? <RenterRefusal failed={paypal.failed} /> : null}
      {goElsewhere ? (
        <Button label={goElsewhere.label} onPress={() => router.dismissTo(goElsewhere.href)} />
      ) : reopen ? (
        <Button label={reason === 'not_approved' ? t('openAgain') : (againLabel ?? t('openAgain'))} icon="payment" loading={paypal.opening} onPress={() => void paypal.open()} />
      ) : (
        <Button label={t('paid.retry')} onPress={confirmed.retry} />
      )}
      <Button label={next.label} variant="secondary" onPress={goNext} />
    </>
  ) : undefined;

  return (
    <Screen footer={footer}>
      {finished ? (
        <Outcome icon="success" iconColor={color.success} text={texts.done} />
      ) : reviewing ? (
        <Outcome icon="clock" iconColor={color.mutedForeground} text={held.text} />
      ) : failed ? (
        <RenterRefusal failed={failed} wording={reason === 'not_approved' && closed ? { ...wording, not_approved: t('cancelled') } : wording} />
      ) : (
        <View role="status" accessible accessibilityLiveRegion="polite" className="items-center gap-4 py-12">
          <ActivityIndicator color={color.primary} size="large" />
          <Text tone="muted" className="text-center">
            {texts.checking}
          </Text>
          {working ? <Button label={t('checkAgain')} variant="secondary" onPress={read.retry} /> : null}
        </View>
      )}
    </Screen>
  );
}

function Outcome({ icon, iconColor, text }: { icon: 'success' | 'clock'; iconColor: string; text: string }) {
  return (
    <View role="status" accessible accessibilityLiveRegion="polite" className="gap-4 pt-6">
      <Icon name={icon} color={iconColor} size={44} />
      <Text variant="title" selectable>
        {text}
      </Text>
    </View>
  );
}
