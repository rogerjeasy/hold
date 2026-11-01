import { useTranslations } from 'use-intl';
import type { RentalState } from '@hold/domain';
import type { RenterView } from '@hold/mobile-api';
import { View } from 'react-native';
import { Panel } from '@/components/ui';
import { ClaimRow } from './claim-row';
import { LinkRow } from './link-row';

type Rental = RenterView<'rental'>;

// A rental has a condition report from its handover on, and may have a claim once it is back.
const HANDED_OVER: ReadonlySet<RentalState> = new Set(['out', 'overdue', 'dropped_off', 'returned', 'inspecting', 'settling', 'closed']);
const BACK: ReadonlySet<RentalState> = new Set(['returned', 'inspecting', 'settling', 'closed']);
const WITH_RENTER: ReadonlySet<RentalState> = new Set(['out', 'overdue']);

// Every other page of the rental that applies now, each a route under /r/<token> as on the web, so the renter never
// needs the browser: the condition report, more days, a report of something that happened, returning it with nobody
// at the counter, the claim, the assistant, the rental's record and the Clean Record.
export function RentalLinks({ token, rental }: { token: string; rental: Rental }) {
  const t = useTranslations('rental');
  const { view, selfReturn, assistant } = rental;
  const at = (page: string) => `/r/${token}/${page}` as const;
  const rows = [
    HANDED_OVER.has(view.state) ? <LinkRow key="condition" href={at('condition')} icon="photos" title={t('status.condition')} /> : null,
    rental.canExtend ? <LinkRow key="extend" href={at('extend')} icon="calendarPlus" title={t('keepLonger')} /> : null,
    rental.canReport && WITH_RENTER.has(view.state) ? <LinkRow key="incident" href={at('incident')} icon="warning" title={t('somethingHappened')} /> : null,
    selfReturn.droppedOffAt !== null || view.state === 'dropped_off' ? (
      <LinkRow key="return" href={at('return')} icon="dropOffs" title={t('status.returnReceipt')} />
    ) : selfReturn.offered && !selfReturn.shopClosed ? (
      <LinkRow key="return" href={at('return')} icon="dropOffs" title={t('selfReturn.openTitle')} detail={t('selfReturn.meta')} />
    ) : null,
    BACK.has(view.state) ? <ClaimRow key="claim" token={token} /> : null,
    assistant === null ? null : (
      <LinkRow key="assistant" href={at('assistant')} icon="assistant" title={t(`assistantState.${assistant.revoked ? 'disconnected' : assistant.connected ? 'connected' : 'booked'}`)} />
    ),
    <LinkRow key="record" href={at('record')} icon="document" title={t('record')} />,
    <LinkRow key="trust" href={at('trust')} icon="shield" title={t('cleanRecord')} />,
  ].filter((row) => row !== null);
  return (
    <Panel title={t('todo')}>
      <View className="-mt-px">{rows}</View>
    </Panel>
  );
}
