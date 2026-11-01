import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocale, useTranslations } from 'use-intl';
import { useAnswer } from '@/api';
import { Button, QrCode, Text } from '@/components/ui';
import { RefusalNotice } from '@/features/shop-session/refusal';
import { staffAct } from '@/features/shop-session/staff-request';
import { useTheme } from '@/theme';

// The renter's link, full screen, for the renter to scan across the counter: the rental itself, or, with
// purpose=hold, the page where they approve the hold in PayPal. Each opening makes a fresh link, as on the web.
export function LinkScreen() {
  const { rentalId, purpose } = useLocalSearchParams<{ rentalId: string; purpose?: string }>();
  const t = useTranslations('shop.link');
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const hold = purpose === 'hold';
  const { state, retry } = useAnswer(`link:${rentalId}:${hold ? 'hold' : 'renter'}`, (api) => staffAct(api, hold ? 'ask-for-hold' : 'show-renter-link', { rentalId }, locale));
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 24, paddingRight: insets.right + 24 }}>
      <View className="w-full max-w-prose flex-1 gap-6 self-center">
        <View className="gap-2">
          <Text variant="title" role="heading">
            {hold ? t('hold') : t('renter')}
          </Text>
          <Text tone="muted">{hold ? t('holdBody') : t('renterBody')}</Text>
        </View>
        <View className="flex-1 justify-center">
          {state.status === 'loading' ? <Making /> : state.status === 'failed' ? <Failed refusal={{ ok: false, failure: state.failure, ...(state.reason === undefined ? {} : { reason: state.reason }) }} onRetry={retry} /> : <Code url={state.value.url} />}
        </View>
        <Button label={t('done')} variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}

function Making() {
  const t = useTranslations('shop.link');
  const { color } = useTheme();
  return (
    <View className="items-center gap-3">
      <ActivityIndicator color={color.mutedForeground} />
      <Text tone="muted">{t('making')}</Text>
    </View>
  );
}

function Code({ url }: { url: string }) {
  const t = useTranslations('shop.link');
  return (
    <View className="gap-4">
      <View className="w-full max-w-96 self-center border border-border-strong bg-band-foreground p-3">
        <QrCode value={url} label={t('code', { url })} />
      </View>
      <Text variant="small" tone="muted" selectable numberOfLines={2} className="text-center">
        {url}
      </Text>
    </View>
  );
}

const PASSING = ['offline', 'timeout', 'unexpected', 'rate_limited'];

function Failed({ refusal, onRetry }: { refusal: Parameters<typeof RefusalNotice>[0]['refusal']; onRetry: () => void }) {
  const common = useTranslations('common');
  return (
    <View className="gap-4">
      <RefusalNotice refusal={refusal} />
      {PASSING.includes(refusal.failure) ? <Button variant="secondary" label={common('retry')} onPress={onRetry} className="self-start" /> : null}
    </View>
  );
}
