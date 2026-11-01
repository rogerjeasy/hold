import { Linking, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button, Notice, Panel, Text } from '@/components/ui';
import type { TurnedOn } from '@/push/registration';

export type PushProblem = Exclude<TurnedOn, 'on'>;

type PushCardProps = {
  readonly choice: 'offer' | 'on' | 'off';
  readonly words: { readonly offerTitle: string; readonly offerBody: string; readonly onBody: string; readonly offBody: string };
  readonly problem: PushProblem | undefined;
  readonly busy: boolean;
  readonly onTurnOn: () => void;
  readonly onTurnOff: () => void;
  readonly onNotNow: () => void;
};

// Notifications for one rental or for the counter: first an offer that says what they bring, asked for only when the
// person turns them on; then the setting, on or off. A refusal by the phone points to its Settings.
export function PushCard({ choice, words, problem, busy, onTurnOn, onTurnOff, onNotNow }: PushCardProps) {
  const t = useTranslations('push');
  const title = choice === 'offer' ? words.offerTitle : choice === 'on' ? t('onTitle') : t('offTitle');
  const body = choice === 'offer' ? words.offerBody : choice === 'on' ? words.onBody : words.offBody;
  return (
    <Panel title={title}>
      <View className="gap-4 p-4">
        <Text tone="muted">{body}</Text>
        {problem === undefined ? null : <PushProblemNotice problem={problem} />}
        <View className="flex-row flex-wrap gap-3">
          {choice === 'on' ? (
            <Button label={t('turnOff')} icon="bellOff" variant="secondary" loading={busy} onPress={onTurnOff} />
          ) : (
            <Button label={t('turnOn')} icon="bell" variant={choice === 'offer' ? 'primary' : 'secondary'} loading={busy} onPress={onTurnOn} />
          )}
          {choice === 'offer' ? <Button label={t('notNow')} variant="secondary" disabled={busy} onPress={onNotNow} /> : null}
        </View>
      </View>
    </Panel>
  );
}

export function PushProblemNotice({ problem }: { problem: PushProblem }) {
  const t = useTranslations('push');
  if (problem === 'denied') {
    return (
      <Notice tone="warning" title={t('deniedTitle')} body={t('deniedBody')} announced>
        <Button label={t('openSettings')} icon="settings" variant="secondary" onPress={() => void Linking.openSettings()} className="self-start" />
      </Notice>
    );
  }
  return <Notice tone="warning" title={t(problem === 'unavailable' ? 'unavailableTitle' : 'failedTitle')} body={t(problem === 'unavailable' ? 'unavailableBody' : 'failedBody')} announced />;
}
