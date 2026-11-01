import { useTranslations } from 'use-intl';
import { MoneyText, StatusPill } from '@/components/ui';
import { useRenterView } from '@/features/renter-common';
import { LinkRow } from './link-row';

// The rental's damage claim, once a person at the shop approved one: Hold answers "not found" until then, and the row
// stays away. It says where the claim stands and its total; the claim's own page says the rest.
export function ClaimRow({ token }: { token: string }) {
  const t = useTranslations('rental');
  const { state } = useRenterView(token, 'claim');
  if (state.status !== 'ready') return null;
  const claim = state.value;
  return (
    <LinkRow
      href={`/r/${token}/claim`}
      icon="claim"
      title={t('claim')}
      aside={
        <>
          <MoneyText variant="small" tone="muted" money={{ cents: claim.totalCents, currency: claim.currency }} />
          <StatusPill label={t(`claimStates.${claim.state}`)} tone={claim.state === 'presented' ? 'primary' : 'neutral'} />
        </>
      }
    />
  );
}
