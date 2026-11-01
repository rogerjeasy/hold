import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { useTranslations } from 'use-intl';
import type { RenterView } from '@hold/mobile-api';
import { Icon, MoneyText, Screen, Text } from '@/components/ui';
import { LoadedScreen, notYetAsEmpty, ShopLine, useLookAgain, useRenterView } from '@/features/renter-common';
import { useTheme } from '@/theme';
import { SettlementConfirm } from './settlement-confirm';
import { StopAdvocate } from './stop-advocate';
import { TranscriptView } from './transcript-view';

export type RenterNegotiation = RenterView<'negotiation'>;

// The renter's advocate (extensions.md section 9): what the advocates said, the renter's own highest total, the final
// tap on an agreement, and a way to stop the advocate. The shop's limits are never part of what it is given.
export function NegotiationScreen({ token }: { token: string }) {
  const t = useTranslations('negotiation');
  const { state, retry } = useRenterView(token, 'negotiation');
  return (
    <LoadedScreen
      state={notYetAsEmpty(state)}
      onRetry={retry}
      isEmpty={(value) => value === null}
      empty={{ title: t('none.title'), body: t('none.body'), action: <ToClaim token={token} /> }}
    >
      {(value) => (value === null ? null : <Negotiation token={token} value={value} refresh={retry} />)}
    </LoadedScreen>
  );
}

function Negotiation({ token, value, refresh }: { token: string; value: RenterNegotiation; refresh: () => void }) {
  const t = useTranslations('negotiation');
  const { transcript } = value;
  const running = transcript.state === 'open' || transcript.state === 'agreed';
  useLookAgain(transcript.state === 'open' || (transcript.state === 'agreed' && !value.awaitingRenter), refresh);
  return (
    <Screen>
      <ShopLine shopName={value.shopName} simulated={transcript.simulated} />
      <View className="gap-1 border-l-4 border-primary bg-card p-4">
        <Text variant="label" tone="muted">
          {t('yourLimit')}
        </Text>
        <MoneyText money={{ cents: value.highestTotalCents, currency: transcript.currency }} variant="figure" />
        <Text variant="small" tone="muted">
          {t('onlyYou')}
        </Text>
      </View>
      {value.advocate === 'assistant' ? <Text>{t('assistantArgues')}</Text> : null}
      {value.canAct && value.awaitingRenter && transcript.agreedCents !== null ? (
        <SettlementConfirm token={token} agreed={{ cents: transcript.agreedCents, currency: transcript.currency }} refresh={refresh} />
      ) : null}
      {transcript.state === 'agreed' && transcript.renterConfirmedAt !== null ? <Text role="status">{t('confirm.waitingShop')}</Text> : null}
      <TranscriptView transcript={transcript} assistant={value.advocate === 'assistant'} />
      {value.stopped ? <Text>{t('stop.stopped')}</Text> : value.canAct && running ? <StopAdvocate token={token} refresh={refresh} /> : null}
      <ToClaim token={token} />
    </Screen>
  );
}

function ToClaim({ token }: { token: string }) {
  const t = useTranslations('negotiation.none');
  const { color } = useTheme();
  return (
    <Link href={`/r/${token}/claim`} asChild>
      <Pressable role="link" aria-label={t('toClaim')} className="min-h-touch flex-row items-center gap-1 self-start active:opacity-70">
        <Text variant="bodyStrong" tone="primary">
          {t('toClaim')}
        </Text>
        <Icon name="forward" color={color.primary} size={16} />
      </Pressable>
    </Link>
  );
}
