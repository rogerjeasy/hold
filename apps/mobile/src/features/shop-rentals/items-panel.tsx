import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslations } from 'use-intl';
import type { RentalView } from '@hold/mobile-api';
import { Button, Icon, Panel, Text } from '@/components/ui';
import { RefusalNotice } from '@/features/shop-session/refusal';
import { useStaffAction } from '@/features/shop-session/use-staff-action';
import { useTheme } from '@/theme';

type Item = RentalView['items'][number];

const HANDING_OVER = ['ready', 'out'];
const TAKING_BACK = ['out', 'overdue', 'dropped_off', 'returned', 'inspecting', 'settling'];

// The rental's items, each with its handover and its return (architecture.md section 11.2): photographed view by view
// and sealed, then photographed again as it comes back.
export function ItemsPanel({ rental, act }: { rental: RentalView; act: boolean }) {
  const t = useTranslations('shop.rental');
  const { act: run, pending, refusal } = useStaffAction();
  const open = async (name: 'start-handover' | 'start-return', item: Item) => {
    const started = await run(name, { rentalId: rental.id, itemId: item.id }, `${name}:${item.id}`);
    if (started.ok) router.push(`/shop/session/${started.value.sessionId}`);
  };
  return (
    <Panel title={t('items')}>
      {rental.items.map((item, index) => (
        <View key={item.id} className={`gap-3 px-4 py-4 ${index === 0 ? '' : 'border-t border-border'}`}>
          <View className="gap-0.5">
            <Text variant="bodyStrong">{item.label}</Text>
            <Text variant="small" tone="muted">
              {item.typeName}
            </Text>
          </View>
          <Handover item={item} show={HANDING_OVER.includes(rental.state)} act={act} busy={pending === `start-handover:${item.id}`} onStart={() => void open('start-handover', item)} />
          {TAKING_BACK.includes(rental.state) && item.handover?.sealed ? (
            <Return item={item} act={act} busy={pending === `start-return:${item.id}`} onStart={() => void open('start-return', item)} />
          ) : null}
          {act ? <StatusLink rentalId={rental.id} item={item} /> : null}
        </View>
      ))}
      {refusal ? (
        <View className="px-4 pb-4">
          <RefusalNotice refusal={refusal} />
        </View>
      ) : null}
    </Panel>
  );
}

function Done({ label }: { label: string }) {
  const { color } = useTheme();
  return (
    <View className="flex-row items-center gap-2">
      <Icon name="success" color={color.success} size={18} />
      <Text variant="small" tone="muted">
        {label}
      </Text>
    </View>
  );
}

function Handover({ item, show, act, busy, onStart }: { item: Item; show: boolean; act: boolean; busy: boolean; onStart: () => void }) {
  const t = useTranslations('shop.rental.handover');
  if (item.handover?.sealed) return <Done label={t('sealed')} />;
  if (!show || !act) return null;
  if (item.handover !== null) {
    const sessionId = item.handover.sessionId;
    return <Button icon="camera" label={t('continueItem', { item: item.label })} onPress={() => router.push(`/shop/session/${sessionId}`)} />;
  }
  return <Button icon="camera" label={t('startItem', { item: item.label })} onPress={onStart} loading={busy} />;
}

function Return({ item, act, busy, onStart }: { item: Item; act: boolean; busy: boolean; onStart: () => void }) {
  const t = useTranslations('shop.rental.return');
  const taken = item.return;
  if (taken?.comparisonId) {
    const comparisonId = taken.comparisonId;
    return (
      <View className="gap-3">
        <Done label={t('sealed')} />
        {act ? <Button variant="secondary" icon="document" label={t('reviewItem', { item: item.label })} onPress={() => router.push(`/shop/review/${comparisonId}`)} /> : null}
      </View>
    );
  }
  if (taken?.sealed) return <Done label={t('sealed')} />;
  if (!act) return null;
  if (taken) return <Button icon="camera" label={t('continueItem', { item: item.label })} onPress={() => router.push(`/shop/session/${taken.sessionId}`)} />;
  return <Button icon="camera" label={t('startItem', { item: item.label })} onPress={onStart} loading={busy} />;
}

function StatusLink({ rentalId, item }: { rentalId: string; item: Item }) {
  const t = useTranslations('shop.rental.item');
  const { color } = useTheme();
  return (
    <Pressable
      role="button"
      aria-label={t('statusItem', { item: item.label })}
      onPress={() => router.push({ pathname: '/shop/rental/[rentalId]/item/[itemId]', params: { rentalId, itemId: item.id, label: item.label } })}
      className="min-h-touch flex-row items-center gap-2 self-start active:opacity-60"
    >
      <Icon name="repair" color={color.mutedForeground} size={18} />
      <Text variant="small" tone="muted" className="underline">
        {t('status')}
      </Text>
    </Pressable>
  );
}
