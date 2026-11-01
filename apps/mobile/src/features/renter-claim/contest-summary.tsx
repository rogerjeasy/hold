import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Panel, StatusPill, Text } from '@/components/ui';
import { EvidencePhoto, Quoted, useShopTime } from '@/features/renter-common';
import type { RenterClaim } from './claim-screen';

type Contest = NonNullable<RenterClaim['contest']>;
type ContestLine = Contest['lines'][number];

// The shop's side of a line, in the record's own words: what the comparison found, or the reason a person wrote. Never
// the model's, which reads the renter's words and so must not speak for the shop.
function useShopSide() {
  const t = useTranslations('claim.contest.facts');
  return (line: ContestLine) => (line.source === 'agreed_in_rental' ? t('agreedDuringRental') : line.reason !== '' ? line.reason : line.description);
}

// What the records show about a disputed line, found by code and worded by templates: never the model's words.
function useFacts(contest: Contest, timeZone: string) {
  const t = useTranslations('claim.contest.facts');
  const time = useShopTime(timeZone);
  return (line: ContestLine) => {
    const own =
      line.source === 'finding'
        ? [line.bothLooksConfirmed ? t('confirmedTwice') : t('foundOnce'), line.knownMarkNearby ? t('markNearby') : t('noMarkNearby')]
        : line.source === 'agreed_in_rental'
          ? [t('agreedDuringRental')]
          : [t('addedBy', { name: line.addedBy ?? t('someone') })];
    const { rental } = contest;
    const condition =
      rental.conditionReply === 'confirmed' && rental.conditionRepliedAt !== null
        ? t('conditionConfirmed', { when: time.when(rental.conditionRepliedAt) })
        : rental.conditionReply === 'added'
          ? t('conditionAdded')
          : t('conditionNotAnswered');
    return [...own, condition, rental.incidentsReported > 0 ? t('incidentReported') : t('noIncident'), ...(rental.renterPhotos > 0 ? [t('renterPhotos', { count: rental.renterPhotos })] : [])];
  };
}

// The neutral summary of a contest (architecture.md section 6.15), in the renter's language. The layout and every fact
// are plain code; only the sentences are the model's, labelled as such. With no summary, the renter's words and the
// facts still show.
export function ContestSummary({ contest, timeZone, lines }: { contest: Contest; timeZone: string; lines: RenterClaim['lines'] }) {
  const t = useTranslations('claim.contest');
  const factsOf = useFacts(contest, timeZone);
  const shopSide = useShopSide();
  const summary = contest.version;
  const said = (lineId: string) => summary?.lines.find((line) => line.lineId === lineId);
  return (
    <Panel title={t('title')}>
      <View className="gap-3 border-b border-border p-4">
        {summary === null ? (
          <>
            <Text>{t(`missing.${contest.outcome === 'answered' ? 'pending' : contest.outcome}`)}</Text>
            <Quoted caption={t('youWrote')} text={contest.comment === '' ? t('noWords') : contest.comment} />
          </>
        ) : (
          <>
            <Text variant="lead" selectable>
              {summary.overview}
            </Text>
            <Text variant="bodyStrong">{t('count', { disputed: summary.lines.filter((line) => line.disputed).length, total: summary.lines.length })}</Text>
            <View className="flex-row flex-wrap items-center gap-2">
              <StatusPill label={contest.simulated ? t('bySimulated') : t('byClaude')} />
              <Text variant="small" tone="muted" className="min-w-0 flex-1">
                {t('neutral')}
              </Text>
            </View>
          </>
        )}
      </View>
      {contest.lines.map((line, index) => {
        const words = said(line.id);
        const disputed = words?.disputed ?? true;
        const photos = lines.find((each) => each.id === line.id);
        return (
          <View key={line.id} className={`gap-3 p-4 ${index === 0 ? '' : 'border-t border-border'}`}>
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Text variant="heading" className="shrink">
                {line.description}
              </Text>
              {words === undefined ? null : <StatusPill label={disputed ? t('disputed') : t('notDisputed')} tone={disputed ? 'primary' : 'success'} />}
            </View>
            {words !== undefined && !disputed ? (
              <Text tone="muted">{shopSide(line)}</Text>
            ) : (
              <>
                {words === undefined ? null : (
                  <View className="gap-2">
                    <View className="gap-1 border border-border p-3">
                      <Text variant="label" tone="muted">
                        {t('shopSays')}
                      </Text>
                      <Text selectable>{shopSide(line)}</Text>
                    </View>
                    <View className="gap-1 border border-border p-3">
                      <Text variant="label" tone="muted">
                        {t('youSaid')}
                      </Text>
                      {words.renterQuote === null ? null : <Quoted text={`“${words.renterQuote}”`} />}
                      {words.renterSays === null ? null : (
                        <Text variant="small" tone="muted">
                          {words.renterSays}
                        </Text>
                      )}
                    </View>
                  </View>
                )}
                {photos === undefined || (photos.beforeUrl === null && photos.afterUrl === null) ? null : (
                  <View className="flex-row gap-2">
                    <View className="min-w-0 flex-1 gap-1">
                      <EvidencePhoto url={photos.beforeUrl} label={t('before', { line: line.description })} />
                      <Text variant="tag" tone="muted">
                        {t('beforeShort')}
                      </Text>
                    </View>
                    <View className="min-w-0 flex-1 gap-1">
                      <EvidencePhoto url={photos.afterUrl} label={t('after', { line: line.description })} region={photos.region} />
                      <Text variant="tag" tone="muted">
                        {t('afterShort')}
                      </Text>
                    </View>
                  </View>
                )}
                <View className="gap-1.5 bg-background p-3">
                  <Text variant="bodyStrong">{t('records')}</Text>
                  {factsOf(line).map((fact) => (
                    <View key={fact} className="flex-row gap-2">
                      <Text aria-hidden>•</Text>
                      <Text className="min-w-0 flex-1">{fact}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        );
      })}
    </Panel>
  );
}
