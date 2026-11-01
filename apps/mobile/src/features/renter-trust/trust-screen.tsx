import { Share, View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { RenterView } from '@hold/mobile-api';
import { Button, MoneyText, Panel, QrCode, Screen, Text } from '@/components/ui';
import { LoadedScreen, ShopLine, useRenterView, useShopTime } from '@/features/renter-common';
import { ConsentPanel } from './consent-panel';
import { DeleteRecord } from './delete-record';

export type RenterTrust = RenterView<'trust'>;
type Own = NonNullable<RenterTrust['own']>;

// Large enough to scan from across a counter, small enough to leave the text beside it on a phone.
const QR_MAX_WIDTH = 288;

const COUNTS = ['clean', 'settled', 'unpaid', 'open', 'shops'] as const;

// The renter's Clean Record (extensions.md section 7.6): the counts, the deposits never taken from them, the credential
// to show, whether other Hold shops may use it, and deleting it. It names no shop and no amount it was not given.
export function TrustScreen({ token }: { token: string }) {
  const t = useTranslations('trust');
  const { state, retry } = useRenterView(token, 'trust');
  return (
    <LoadedScreen state={state} onRetry={retry} empty={{ title: t('title'), body: t('notYet') }}>
      {(view) => (
        <Screen>
          <ShopLine shopName={view.shopName} />
          <Text variant="lead" tone="muted">
            {view.own === null ? t('notYet') : t('lead')}
          </Text>
          {view.own === null ? null : <Record token={token} view={view} own={view.own} refresh={retry} />}
        </Screen>
      )}
    </LoadedScreen>
  );
}

function Record({ token, view, own, refresh }: { token: string; view: RenterTrust; own: Own; refresh: () => void }) {
  const t = useTranslations('trust');
  return (
    <>
      <Panel title={t('counts', { months: own.record.windowMonths })}>
        <View className="flex-row flex-wrap">
          {COUNTS.map((count) => (
            <View key={count} className="min-w-0 gap-1 border-b border-border px-4 py-3" style={{ flexBasis: '50%', flexGrow: 1 }}>
              <Text variant="small" tone="muted">
                {t(count)}
              </Text>
              <Text variant="figure" style={{ fontVariant: ['tabular-nums'] }}>
                {own.record[count]}
              </Text>
            </View>
          ))}
        </View>
      </Panel>
      <View className="gap-2">
        <Text variant="heading" role="heading">
          {t('neverTakenTitle')}
        </Text>
        {own.neverTaken.length === 0 ? (
          <Text tone="muted">{t('neverTakenNone')}</Text>
        ) : (
          own.neverTaken.map((each) => (
            <View key={each.amount.currency} className="flex-row flex-wrap items-baseline gap-x-2">
              <MoneyText money={each.amount} variant="figure" />
              <Text tone="muted">{t('across', { count: each.rentals })}</Text>
            </View>
          ))
        )}
      </View>
      <Credential credential={view.credential} timeZone={view.timeZone} />
      <ConsentPanel token={token} consent={own.consent} refresh={refresh} />
      <DeleteRecord token={token} />
    </>
  );
}

// The record as it leaves Hold (extensions.md section 7.7): a signed credential, drawn here as a code to scan from its
// check address, and as text to share. Reissued each time the screen is opened.
function Credential({ credential, timeZone }: { credential: RenterTrust['credential']; timeZone: string }) {
  const t = useTranslations('trust');
  const time = useShopTime(timeZone);
  return (
    <Panel title={t('credential')}>
      {credential === null ? (
        <Text className="p-4">{t('credentialUnavailable')}</Text>
      ) : (
        <View className="gap-4 p-4">
          <Text tone="muted">{t('credentialLead', { time: time.time(credential.expiresAt) })}</Text>
          <View className="w-full self-center border border-border p-2" style={{ maxWidth: QR_MAX_WIDTH }}>
            <QrCode value={credential.url} label={t('credentialScan')} />
          </View>
          <Text variant="small" tone="muted">
            {t('credentialText')}
          </Text>
          <Text variant="small" selectable className="font-figure">
            {credential.token}
          </Text>
          <Button label={t('share')} icon="share" variant="secondary" onPress={() => void Share.share({ message: credential.url })} />
        </View>
      )}
    </Panel>
  );
}
