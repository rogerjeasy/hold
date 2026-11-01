import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { useTranslations } from 'use-intl';
import type { RenterView } from '@hold/mobile-api';
import { Icon, Screen, Text } from '@/components/ui';
import { LoadedScreen, notYetAsEmpty, ShopLine, useLookAgain, useRenterView } from '@/features/renter-common';
import { useTheme } from '@/theme';
import { ClaimAmounts } from './claim-amounts';
import { ClaimLine } from './claim-line';
import { ClaimMessages } from './claim-messages';
import { ClaimReply } from './claim-reply';
import { ClaimStatus, isSettling } from './claim-status';
import { ContestSummary } from './contest-summary';

export type RenterClaim = RenterView<'claim'>;

// The renter's damage claim, once a person at the shop approved it: where it stands, the amounts, each line with its
// evidence, the reply with a one-time code, and the messages with the shop. Before any claim, it says so.
export function ClaimScreen({ token }: { token: string }) {
  const t = useTranslations('claim');
  const { state, retry } = useRenterView(token, 'claim');
  return (
    <LoadedScreen state={notYetAsEmpty(state)} onRetry={retry} empty={{ title: t('none.title'), body: t('none.body') }} isEmpty={(claim) => claim === null}>
      {(claim) => (claim === null ? null : <Claim token={token} claim={claim} refresh={retry} />)}
    </LoadedScreen>
  );
}

function Claim({ token, claim, refresh }: { token: string; claim: RenterClaim; refresh: () => void }) {
  const t = useTranslations('claim');
  useLookAgain(isSettling(claim) || claim.state === 'contested' || claim.state === 'negotiating', refresh);
  // Once contested, the conversation is what the renter comes back for, so it sits near the top.
  const awaitingDecision = (claim.promise?.decideBy ?? null) !== null;
  const messages = <ClaimMessages token={token} claim={claim} refresh={refresh} />;
  return (
    <Screen>
      <ShopLine shopName={claim.shopName} />
      <ClaimStatus claim={claim} />
      <View className="flex-row flex-wrap gap-x-5">
        <ClaimLink href={`/r/${token}/record`} label={t('record')} />
        {claim.negotiation ? <ClaimLink href={`/r/${token}/negotiation`} label={t('negotiationLink')} /> : null}
      </View>
      <ClaimAmounts claim={claim} />
      {awaitingDecision ? messages : null}
      {claim.contest === null ? null : <ContestSummary contest={claim.contest} timeZone={claim.timeZone} lines={claim.lines} />}
      <View className="gap-4">
        <Text variant="heading" role="heading">
          {t('lines', { count: claim.lines.length })}
        </Text>
        {claim.lines.map((line) => (
          <ClaimLine key={line.id} line={line} currency={claim.currency} timeZone={claim.timeZone} />
        ))}
      </View>
      <ClaimReply token={token} claim={claim} refresh={refresh} />
      {awaitingDecision ? null : messages}
    </Screen>
  );
}

function ClaimLink({ href, label }: { href: `/r/${string}`; label: string }) {
  const { color } = useTheme();
  return (
    <Link href={href} asChild>
      <Pressable role="link" aria-label={label} className="min-h-touch flex-row items-center gap-1 active:opacity-70">
        <Text variant="bodyStrong" tone="primary">
          {label}
        </Text>
        <Icon name="forward" color={color.primary} size={16} />
      </Pressable>
    </Link>
  );
}
