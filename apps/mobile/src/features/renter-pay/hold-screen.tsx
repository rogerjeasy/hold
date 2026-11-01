import { View } from 'react-native';
import { router } from 'expo-router';
import { useLocale, useTranslations } from 'use-intl';
import { formatMoney, money } from '@hold/domain';
import type { RenterView } from '@hold/mobile-api';
import { Icon, LoadState, MoneyText, Screen, Text } from '@/components/ui';
import { useRenterView, useShopTime } from '@/features/renter-common';
import { contactOnHold } from '@/features/renter-contact/contact';
import { ContactPanel } from '@/features/renter-contact/contact-panel';
import { useTheme } from '@/theme';
import { confirmAt } from './confirm-at';
import { PayPalButton } from './paypal-button';

type Hold = NonNullable<RenterView<'hold'>['hold']>;
type Rental = RenterView<'hold'>['view'];

// Where the renter approves the hold at pickup, from the code staff show: what the hold is, that it is not a charge,
// and PayPal for exactly the amount agreed at booking. A placed hold with an order waiting is being replaced before it
// ends, on a rental longer than a hold lasts.
export function HoldScreen({ token }: { token: string }) {
  const { state, retry } = useRenterView(token, 'hold');
  const loaded = state.status === 'ready' ? state.value : undefined;
  const asking = loaded?.hold != null && (loaded.hold.state === 'requested' || loaded.hold.orderId !== null);
  return (
    <Screen footer={loaded?.hold != null && asking ? <ApproveFooter token={token} view={loaded.view} hold={loaded.hold} /> : undefined}>
      <LoadState state={state} onRetry={retry} empty={{ title: '', body: '' }}>
        {(loaded) => {
          // Chosen before the hold is placed, so the codes after it reach the renter as they chose.
          const contact = contactOnHold(loaded);
          return (
            <>
              <HoldBody view={loaded.view} hold={loaded.hold} asking={asking} />
              {contact === undefined ? null : <ContactPanel token={token} contact={contact} />}
            </>
          );
        }}
      </LoadState>
    </Screen>
  );
}

function HoldBody({ view, hold, asking }: { view: Rental; hold: Hold | null; asking: boolean }) {
  const t = useTranslations('pay');
  const rental = useTranslations('rental');
  const locale = useLocale();
  const { color } = useTheme();
  const format = useShopTime(view.timeZone);
  const price = (cents: number) => formatMoney(money(cents, view.currency), locale);
  const amount = price(hold?.reservedCents ?? view.holdCents);
  const replacing = hold !== null && hold.state !== 'requested' && hold.orderId !== null;
  const reason = hold?.trust != null && hold.reservedCents < hold.ordinaryCents ? t('trustReason', { amount, ordinary: price(hold.ordinaryCents), count: hold.trust.cleanReturns, months: hold.trust.windowMonths }) : undefined;
  return (
    <View className="gap-5">
      <Text variant="label" tone="muted">
        {view.shopName}
      </Text>
      {hold !== null && asking ? (
        // While the renter is asked, the amount is what matters most; the header already says what this is.
        <View className="gap-1">
          <View className="flex-row items-center gap-2">
            <Icon name="hold" color={color.primary} size={20} />
            <Text variant="label" tone="muted">
              {replacing ? t('hold.replaceTitle') : rental('hold')}
            </Text>
          </View>
          <MoneyText variant="headline" money={{ cents: hold.reservedCents, currency: view.currency }} />
        </View>
      ) : (
        <View className="flex-row items-start gap-3">
          <Icon name={hold?.state === 'placed' ? 'success' : 'hold'} color={hold?.state === 'placed' ? color.success : color.primary} size={30} />
          <Text variant="title" role={hold === null ? undefined : 'heading'} className="min-w-0 flex-1">
            {hold === null ? t('hold.notYet') : placedText(t, hold, view, amount, price(view.feeCents))}
          </Text>
        </View>
      )}
      {hold !== null && asking ? (
        <Text variant="lead">{replacing && hold.validUntil !== null ? t('hold.replaceLead', { amount, date: format.date(hold.validUntil) }) : t('hold.lead', { amount })}</Text>
      ) : null}
      {reason === undefined ? null : (
        <View className="border-l-2 border-primary pl-3">
          <Text>{reason}</Text>
        </View>
      )}
      {hold !== null && asking && hold.placementFailure !== null ? (
        <View role="alert" className="flex-row gap-2 border-l-4 border-destructive bg-card p-3">
          <Icon name="error" color={color.destructive} size={20} />
          <Text tone="destructive" className="min-w-0 flex-1">
            {t('hold.declined')}
          </Text>
        </View>
      ) : null}
      {hold !== null && !asking && hold.validUntil !== null ? <Text tone="muted">{t('hold.validUntil', { date: format.date(hold.validUntil) })}</Text> : null}
    </View>
  );
}

type T = ReturnType<typeof useTranslations<'pay'>>;

// A walk-in's fee is captured from the hold just placed, so the screen waits for it before saying it is paid.
function placedText(t: T, hold: Hold, view: Rental, amount: string, fee: string) {
  if (hold.strategy !== 'combined') return t('hold.placed', { amount });
  return view.state === 'pending_payment' ? t('walkIn.taking', { hold: amount, fee }) : t('walkIn.placed', { hold: amount, fee });
}

function ApproveFooter({ token, view, hold }: { token: string; view: Rental; hold: Hold }) {
  const t = useTranslations('pay');
  const locale = useLocale();
  const amount = formatMoney(money(hold.reservedCents, view.currency), locale);
  const walkIn = hold.strategy === 'combined' && hold.state === 'requested';
  return (
    <PayPalButton
      token={token}
      start="approve-hold"
      label={walkIn ? t('walkIn.approve', { fee: formatMoney(money(view.feeCents, view.currency), locale), hold: amount }) : t('hold.approve', { amount })}
      agree={walkIn ? t('walkIn.agree') : t('hold.agree')}
      onReturn={(orderId, closed) => router.setParams(confirmAt(token, 'pay', orderId, closed).params)}
    />
  );
}
