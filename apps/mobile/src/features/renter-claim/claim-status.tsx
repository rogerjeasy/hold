import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Icon, Notice, Text } from '@/components/ui';
import { Quoted, useShopTime } from '@/features/renter-common';
import { useTheme } from '@/theme';
import type { RenterClaim } from './claim-screen';

const MOVING = new Set(['releasing', 'capturing', 'renewing']);

// Money is moving through PayPal: the screen waits for its confirmation and never assumes it.
export const isSettling = (claim: RenterClaim) => claim.pendingSettlement || claim.state === 'charging' || MOVING.has(claim.holdState);

// Where the claim stands, the shop's promise to decide a contest, and the time left to reply.
export function ClaimStatus({ claim }: { claim: RenterClaim }) {
  const t = useTranslations('claim');
  const time = useShopTime(claim.timeZone);
  return (
    <View className="gap-4">
      <Notice title={t(`states.${claim.state}`)} body={claim.state === 'closed' ? t('settledBody') : claim.canReply || claim.canAcknowledge ? t('renterBoundary') : t('afterReply')} />
      <PromiseStatus claim={claim} />
      {isSettling(claim) ? (
        <Text role="status" accessibilityLiveRegion="polite">
          {t('pending')}
        </Text>
      ) : null}
      {claim.replyDueAt === null || !claim.canReply ? null : <Text variant="bodyStrong">{t('replyDue', { when: time.when(claim.replyDueAt) })}</Text>}
    </View>
  );
}

// The shop's promise to decide a contested claim (architecture.md section 6.16). The server decides where it stands;
// this only says so.
function PromiseStatus({ claim }: { claim: RenterClaim }) {
  const t = useTranslations('claim.promise');
  const time = useShopTime(claim.timeZone);
  const { color } = useTheme();
  const promise = claim.promise;
  if (promise === null || promise.decideBy === null) return null;
  const due = time.when(promise.decideBy);
  const shop = claim.shopName;
  if (promise.standing === 'open') {
    return (
      <View className="flex-row items-center gap-3 border border-border-strong border-l-4 border-l-warning bg-card p-4">
        <Icon name="clock" color={color.foreground} size={30} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="label" tone="muted">
            {t('openLabel')}
          </Text>
          <Text variant="figure" selectable>
            {due}
          </Text>
          <Text variant="small" tone="muted">
            {promise.decideBy > claim.now ? time.relative(promise.decideBy, claim.now) : t('dueNow')}
          </Text>
        </View>
      </View>
    );
  }
  const decided = promise.decidedAt === null ? null : time.when(promise.decidedAt);
  if (promise.standing === 'kept') return <Text tone="muted">{t('keptBody', { shop, when: decided ?? due })}</Text>;
  if (claim.state === 'waived' && promise.missedReason === null && promise.decidedAt !== null) return <Notice tone="success" title={t('waivedTitle')} body={t('waivedBody', { shop, when: due })} />;
  if (promise.missedReason !== null) {
    return (
      <Notice tone="destructive" title={t('lateTitle')} body={t('lateBody', { shop, when: due })}>
        <Quoted text={promise.missedReason} />
      </Notice>
    );
  }
  return <Notice tone="destructive" title={t('missedTitle')} body={t('missedBody', { shop, when: due })} />;
}
