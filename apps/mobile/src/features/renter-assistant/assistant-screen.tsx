import { Alert, View } from 'react-native';
import { useTranslations } from 'use-intl';
import type { RenterView } from '@hold/mobile-api';
import { Button, Icon, Panel, Screen, Text } from '@/components/ui';
import { ActionFailure, Confirmed, LoadedScreen, notYetAsEmpty, Quoted, ShopLine, useRenterAction, useRenterView, useShopTime } from '@/features/renter-common';
import { useTheme } from '@/theme';

type RenterAssistant = RenterView<'assistant'>;

// Everything the renter's own assistant did on their rental, in plain words, and a way to disconnect it (extensions.md
// section 8.5). Its name is what it called itself, shown as text and never trusted. A rental with no assistant answers
// that this link cannot show one, which reads as nothing to show.
export function AssistantScreen({ token }: { token: string }) {
  const t = useTranslations('assistant');
  const { state, retry } = useRenterView(token, 'assistant');
  return (
    <LoadedScreen state={notYetAsEmpty(state, ['link_invalid'])} onRetry={retry} isEmpty={(value) => value === null} empty={{ title: t('noneTitle'), body: t('notConnected') }}>
      {(view) => (view === null ? null : <Assistant token={token} view={view} refresh={retry} />)}
    </LoadedScreen>
  );
}

function Assistant({ token, view, refresh }: { token: string; view: RenterAssistant; refresh: () => void }) {
  const t = useTranslations('assistant');
  const { color } = useTheme();
  const state = view.revokedAt !== null ? 'disconnected' : view.connected ? 'connected' : 'booked';
  return (
    <Screen>
      <View className="gap-3">
        <ShopLine shopName={view.shopName} />
        <View className="flex-row items-start gap-2">
          <Icon name="assistant" color={color.primary} size={28} />
          <Text variant="title" role="heading" className="min-w-0 flex-1">
            {t(`state.${state}`)}
          </Text>
        </View>
        <View className="gap-1">
          <Text variant="small" tone="muted">
            {t('callsItself')}
          </Text>
          <Text variant="bodyStrong" selectable>
            {view.clientLabel === '' ? t('unnamed') : view.clientLabel}
          </Text>
          <Text variant="small" tone="muted">
            {t('notVerified')}
          </Text>
        </View>
        <Text tone="muted">{t('lead')}</Text>
      </View>
      {view.connected ? <Disconnect token={token} refresh={refresh} /> : null}
      {view.revokedAt === null || view.connected ? null : <Confirmed text={t('disconnected')} />}
      {view.draftReply === null ? null : (
        <Panel title={t('draft.title')}>
          <View className="gap-2 p-4">
            <Text variant="bodyStrong">{t(`draft.decision.${view.draftReply.decision}`)}</Text>
            {view.draftReply.comment === '' ? null : <Quoted text={view.draftReply.comment} />}
            <Text variant="small" tone="muted">
              {t('draft.note')}
            </Text>
          </View>
        </Panel>
      )}
      <Actions view={view} />
    </Screen>
  );
}

function Disconnect({ token, refresh }: { token: string; refresh: () => void }) {
  const t = useTranslations('assistant');
  const common = useTranslations('common');
  const disconnect = useRenterAction(token, 'disconnect-assistant');
  const run = async () => {
    if ((await disconnect.run({}))?.ok) refresh();
  };
  const ask = () =>
    Alert.alert(t('disconnect'), t('disconnectLead'), [
      { text: t('disconnect'), style: 'destructive', onPress: () => void run() },
      { text: common('cancel'), style: 'cancel' },
    ]);
  if (disconnect.done) return <Confirmed text={t('disconnected')} />;
  return (
    <View className="gap-3">
      <Text tone="muted">{t('disconnectLead')}</Text>
      <Button label={t('disconnect')} variant="destructive" onPress={ask} loading={disconnect.pending} />
      <ActionFailure failed={disconnect.failed} wording={{ not_connected: t('notConnected') }} />
    </View>
  );
}

function Actions({ view }: { view: RenterAssistant }) {
  const t = useTranslations('assistant');
  const time = useShopTime(view.timeZone);
  type Key = Parameters<typeof t>[0];
  // The audit log names tools and outcomes as text; a name with no words of its own is shown as it is.
  const words = (key: string) => (t.has(key as Key) ? t(key as Key) : undefined);
  return (
    <Panel title={t('did')}>
      {view.actions.length === 0 ? (
        <Text tone="muted" className="p-4">
          {t('nothing')}
        </Text>
      ) : (
        view.actions.map((action, index) => (
          <View key={`${action.tool}-${String(index)}`} className={`gap-0.5 px-4 py-3 ${index === 0 ? '' : 'border-t border-border'}`}>
            <Text variant="bodyStrong">{words(`tools.${action.tool}`) ?? action.tool}</Text>
            {action.outcome === 'ok' ? null : (
              <Text variant="small" tone="warning">
                {words(`outcome.${action.outcome}`) ?? action.outcome}
              </Text>
            )}
            <Text variant="small" tone="muted">
              {time.when(action.at)}
            </Text>
          </View>
        ))
      )}
    </Panel>
  );
}
