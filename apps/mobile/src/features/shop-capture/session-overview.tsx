import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { CaptureSessionView } from '@hold/mobile-api';
import { Notice, SampleLabel, Screen, Text } from '@/components/ui';
import { SealedActions, SealPanel, SealResult } from './seal-panel';
import { useSeal } from './use-seal';
import type { Upload } from './use-uploads';
import { ViewRow } from './view-row';
import { viewStatus } from './view-status';

type OverviewProps = {
  session: CaptureSessionView;
  uploads: Readonly<Record<string, Upload>>;
  onPhotograph: (view: string) => void;
  onRetry: (view: string) => void;
};

// The item's views and where each stands, with the next step at the bottom, in reach of the thumb: the next view to
// photograph, then sealing.
export function SessionOverview({ session, uploads, onPhotograph, onRetry }: OverviewProps) {
  const t = useTranslations('shop.capture');
  const statuses = session.plan.map((view) => ({ view, status: viewStatus(session, uploads, view) }));
  const needed = session.plan.filter((view) => view.required);
  const done = statuses.filter(({ view, status }) => view.required && ['photographed', 'preparing', 'sent'].includes(status.name)).length;
  const editable = session.canAct && !session.sealed;
  const seal = useSeal(session);
  if (seal.sealed) {
    return (
      <Screen footer={<SealedActions sealed={seal.sealed} />}>
        <SealResult sealed={seal.sealed} />
      </Screen>
    );
  }
  return (
    <Screen footer={<SealPanel session={session} uploads={uploads} seal={seal} onPhotograph={onPhotograph} />}>
      <View className="gap-2">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="label" tone="muted">
            {t(session.kind)}
          </Text>
          {session.photos.some((photo) => photo.simulated) ? <SampleLabel kind="simulated" /> : null}
        </View>
        <Text tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
          {t('progress', { done, total: needed.length })}
        </Text>
      </View>
      {session.sealed ? null : <Notice title={t(session.kind)} body={session.kind === 'return' ? t('guidanceReturn') : t('guidanceHandover')} />}
      <View className="gap-2">
        <Text variant="heading" role="heading">
          {t('views')}
        </Text>
        <View className="border-y border-border bg-card">
          {statuses.map(({ view, status }, index) => (
            <ViewRow
              key={view.key}
              session={session}
              view={view}
              status={status}
              first={index === 0}
              editable={editable}
              onPhotograph={() => onPhotograph(view.key)}
              onRetry={() => onRetry(view.key)}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}
