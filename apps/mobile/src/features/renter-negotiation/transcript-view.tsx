import { View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { GROUNDS } from '@hold/domain';
import { MoneyText, Notice, Panel, Text } from '@/components/ui';
import type { RenterNegotiation } from './negotiation-screen';

type Transcript = RenterNegotiation['transcript'];
type Move = Transcript['moves'][number];

const isGround = (ground: string): ground is (typeof GROUNDS)[number] => (GROUNDS as readonly string[]).includes(ground);

// The transcript both people read (extensions.md section 9.7). Every word is Hold's: the moves carry only amounts,
// grounds and the ids of this rental's records, worded here. Neither side's limits are in it.
export function TranscriptView({ transcript, assistant }: { transcript: Transcript; assistant: boolean }) {
  const t = useTranslations('negotiation');
  const money = (cents: number) => ({ cents, currency: transcript.currency });
  return (
    <Panel title={t('transcript.title')}>
      <View className="gap-4 p-4">
        <Text variant="bodyStrong">{t(`states.${transcript.state}`)}</Text>
        {(transcript.state === 'agreed' || transcript.state === 'settled') && transcript.agreedCents !== null ? (
          <View className="flex-row flex-wrap items-baseline justify-between gap-x-3">
            <Text tone="muted">{t('agreedAmount')}</Text>
            <MoneyText money={money(transcript.agreedCents)} variant="figure" />
          </View>
        ) : null}
        {transcript.endedReason === null ? null : <Text>{t(`ended.${transcript.endedReason}`)}</Text>}
        {transcript.simulated ? <Notice title={t('simulated')} body={t('transcript.noLimits')} /> : <Text tone="muted">{t('transcript.noLimits')}</Text>}
        <View>
          {transcript.moves.map((move) => (
            <MoveItem key={move.sequence} move={move} transcript={transcript} assistant={assistant} />
          ))}
        </View>
        <Text variant="small" tone="muted">
          {t(transcript.chainVerified ? 'transcript.chainVerified' : 'transcript.chainBroken')}
        </Text>
      </View>
    </Panel>
  );
}

function MoveItem({ move, transcript, assistant }: { move: Move; transcript: Transcript; assistant: boolean }) {
  const t = useTranslations('negotiation');
  // The negotiation view carries no shop time zone; the phone's own is used.
  const format = useFormatter();
  const money = (cents: number) => ({ cents, currency: transcript.currency });
  // The renter's side is their own assistant when they chose it (extensions.md section 9.11).
  const side = move.side === 'renter' && assistant ? t('transcript.side.renter_assistant') : t(`transcript.side.${move.side}`);
  const ground = (line: Move['lines'][number]) => {
    if (line.ground === null || !isGround(line.ground)) return null;
    if (line.ground !== 'ordinary_wear') return t(`grounds.${line.ground}`);
    return t('grounds.ordinary_wear', { clause: line.evidence.map((id) => transcript.wearClauses.find((clause) => clause.id === id)?.text ?? id).join(' ') });
  };
  return (
    <View className="gap-2 border-b border-border py-3" accessible={false}>
      <Text variant="small" tone="muted">
        {t('transcript.move', { number: move.sequence })} · {side}
      </Text>
      {move.kind === 'offer' && move.totalCents !== null ? (
        <View className="flex-row flex-wrap items-baseline gap-x-2">
          <Text variant="bodyStrong">{t('transcript.offer')}</Text>
          <MoneyText money={money(move.totalCents)} />
        </View>
      ) : (
        <Text variant="bodyStrong">{move.kind === 'accept' ? t('transcript.accept') : t('transcript.pass')}</Text>
      )}
      {move.kind === 'pass' && move.passReason !== null ? <Text>{t(`transcript.passReasons.${move.passReason}`)}</Text> : null}
      {move.lines.map((line) => {
        const published = transcript.lines.find((each) => each.lineId === line.lineId);
        const why = ground(line);
        return (
          <View key={line.lineId} className="gap-0.5">
            <View className="flex-row flex-wrap items-baseline gap-x-2">
              <Text className="shrink">{published?.description ?? ''}</Text>
              <MoneyText money={money(line.cents)} variant="body" />
              {published !== undefined && line.cents < published.publishedCents ? (
                <>
                  <Text variant="small" tone="muted">
                    {t('transcript.instead')}
                  </Text>
                  <MoneyText money={money(published.publishedCents)} variant="small" tone="muted" />
                </>
              ) : null}
            </View>
            {why === null ? null : (
              <Text variant="small" tone="muted">
                {why}
              </Text>
            )}
          </View>
        );
      })}
      <Text variant="small" tone="muted">
        {format.dateTime(new Date(move.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
      </Text>
    </View>
  );
}
