import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useLocale, useTranslations } from 'use-intl';
import { formatMoney, money, shopTimeText } from '@hold/domain';
import type { RenterView } from '@hold/mobile-api';
import { Button, Notice, Screen, Text } from '@/components/ui';
import { LoadedScreen, ShopLine, useRenterAction, useRenterView, useShopTime } from '@/features/renter-common';
import { confirmAt } from '@/features/renter-pay/confirm-at';
import { PayPalButton } from '@/features/renter-pay/paypal-button';
import { RenterRefusal } from '@/features/renter-rental/renter-refusal';
import { DayStepper } from './day-stepper';
import { ExtensionsList } from './extensions-list';
import { QuotePanel } from './quote-panel';
import { useExtendWording } from './use-extend-wording';

type Extension = RenterView<'extension'>;

const DAY = 86_400_000;

// Keeping the item longer from the renter's own phone (architecture.md section 6.14): when it is due back now, more
// days in a tap, Hold's price for them, and PayPal. It goes through once paid, with nobody at the shop to ask.
export function ExtendScreen({ token }: { token: string }) {
  const { state, retry } = useRenterView(token, 'extension');
  return (
    <LoadedScreen state={state} onRetry={retry} empty={{ title: '', body: '' }}>
      {(data) => <Extend token={token} data={data} onQuoted={retry} />}
    </LoadedScreen>
  );
}

function Extend({ token, data, onQuoted }: { token: string; data: Extension; onQuoted: () => void }) {
  const t = useTranslations('extend');
  const format = useShopTime(data.timeZone);
  const open = data.state === 'out' && data.maxDays > 0 && data.canAct;
  const [days, setDays] = useState(Math.min(data.quote?.extraDays ?? 1, Math.max(1, data.maxDays)));
  const newEnd = new Date(Date.parse(data.endsAt) + days * DAY);
  const chosen = shopTimeText(data.timeZone, newEnd);
  const quoted = data.quote !== null && shopTimeText(data.timeZone, new Date(data.quote.endsAt)) === chosen ? data.quote : null;
  return (
    <Screen footer={open ? <ExtendFooter token={token} data={data} chosen={chosen} quoted={quoted !== null} onQuoted={onQuoted} /> : undefined}>
      <View className="gap-3">
        <ShopLine shopName={data.shopName} simulated={data.simulated} />
        <View className="gap-1 border-l-2 border-primary pl-3">
          <Text variant="small" tone="muted">
            {t('dueNow')}
          </Text>
          <Text variant="heading" selectable>
            {format.when(data.endsAt)}
          </Text>
          {data.latestEnd === null || !open ? null : (
            <Text variant="small" tone="muted">
              {t('latest', { when: format.when(data.latestEnd), days: data.maxDays })}
            </Text>
          )}
        </View>
      </View>
      {data.state !== 'out' ? <Notice title={t('closed.title')} body={t('closed.body', { shop: data.shopName })} /> : null}
      {data.state === 'out' && data.maxDays === 0 ? <Notice title={t('off.title')} body={t('off.body', { shop: data.shopName })} /> : null}
      {data.state === 'out' && data.maxDays > 0 && !data.canAct ? <Text tone="muted">{t('noScope')}</Text> : null}
      {open ? <DayStepper days={days} max={data.maxDays} newEnd={format.when(newEnd.toISOString())} onChange={setDays} /> : null}
      {open && quoted !== null ? <QuotePanel quote={quoted} timeZone={data.timeZone} currency={data.currency} holdCents={data.holdCents} /> : null}
      <ExtensionsList extensions={data.extensions} timeZone={data.timeZone} currency={data.currency} />
    </Screen>
  );
}

// "See the price" for the days chosen, and once Hold has priced exactly those, PayPal for that price.
function ExtendFooter({ token, data, chosen, quoted, onQuoted }: { token: string; data: Extension; chosen: string; quoted: boolean; onQuoted: () => void }) {
  const t = useTranslations('extend');
  const locale = useLocale();
  const ask = useRenterAction(token, 'ask-extension');
  const wording = useExtendWording(data.timeZone, ask.failed?.reason);
  if (quoted && data.quote !== null) {
    return (
      <PayPalButton
        token={token}
        start="pay-extension"
        label={t('quote.pay', { amount: formatMoney(money(data.quote.feeCents, data.currency), locale) })}
        agree={t('quote.agree')}
        onReturn={(orderId, closed) => router.push(confirmAt(token, 'extended', orderId, closed))}
      />
    );
  }
  return (
    <>
      {ask.failed ? <RenterRefusal failed={ask.failed} wording={wording} /> : null}
      <Button
        label={t('form.price')}
        loading={ask.pending}
        onPress={async () => {
          const answer = await ask.run({ endsAt: chosen });
          if (answer?.ok === true) onQuoted();
        }}
      />
    </>
  );
}
