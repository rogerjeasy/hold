import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { RenterView } from '@hold/mobile-api';
import { Button, Panel, Screen, Text } from '@/components/ui';
import { ActionFailure, Confirmed, LoadedScreen, ShopLine, useLookAgain, useRenterAction, useRenterView } from '@/features/renter-common';
import { RecordVersion } from './record-version';

export type RenterRecord = RenterView<'record'>;

// The rental's record: each prepared version of its photographs, findings, decisions and settlement, which stays as it
// was, and the receipts sent with them. The renter prepares a new one when they want it.
export function RecordScreen({ token }: { token: string }) {
  const t = useTranslations('record');
  const { state, retry } = useRenterView(token, 'record');
  return (
    <LoadedScreen state={state} onRetry={retry} empty={{ title: t('title'), body: t('empty') }}>
      {(record) => <Record token={token} record={record} refresh={retry} />}
    </LoadedScreen>
  );
}

function Record({ token, record, refresh }: { token: string; record: RenterRecord; refresh: () => void }) {
  const t = useTranslations('record');
  const build = useRenterAction(token, 'build-renter-record');
  const building = record.versions.some((version) => version.state === 'building');
  const failed = record.versions[0]?.state === 'failed';
  useLookAgain(building, refresh);
  const prepare = async () => {
    if ((await build.run({}))?.ok) refresh();
  };
  return (
    <Screen
      footer={
        <>
          <ActionFailure failed={build.failed} />
          <Button label={failed ? t('retry') : record.versions.length > 0 ? t('update') : t('prepare')} icon="document" onPress={() => void prepare()} loading={build.pending} disabled={building} />
        </>
      }
    >
      <ShopLine shopName={record.shopName} />
      <Text variant="lead" tone="muted">
        {t('lead')}
      </Text>
      {build.done && !building ? <Confirmed text={t('requested')} /> : null}
      {record.versions.length === 0 ? <Text>{t('empty')}</Text> : null}
      {record.versions.map((version) => (
        <RecordVersion key={version.id} token={token} version={version} />
      ))}
      <Panel title={t('receiptsTitle')}>
        {record.receipts.length === 0 ? (
          <Text className="p-4" tone="muted">
            {t('receiptsEmpty')}
          </Text>
        ) : (
          record.receipts.map((receipt, index) => <Receipt key={receipt.id} receipt={receipt} versions={record.versions} first={index === 0} />)
        )}
      </Panel>
    </Screen>
  );
}

function Receipt({ receipt, versions, first }: { receipt: RenterRecord['receipts'][number]; versions: RenterRecord['versions']; first: boolean }) {
  const t = useTranslations('record');
  type Key = Parameters<typeof t>[0];
  // Kinds and states arrive as text; one with no words of its own reads as unavailable, never as a code.
  const label = (key: string) => (t.has(key as Key) ? t(key as Key) : t('unavailable'));
  const version = versions.find((each) => each.id === receipt.packId);
  return (
    <View className={`gap-0.5 px-4 py-3 ${first ? '' : 'border-t border-border'}`}>
      <Text variant="bodyStrong">{label(`receiptKinds.${receipt.kind}`)}</Text>
      <Text>{label(`receiptStates.${receipt.status}`)}</Text>
      <Text variant="small" tone="muted">
        {version === undefined ? t('unavailableVersion') : t('version', { number: version.version })}
      </Text>
    </View>
  );
}
