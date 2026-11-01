import { Alert, Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { useFormatter, useTranslations } from 'use-intl';
import { useApi } from '@/api';
import { Icon, Text } from '@/components/ui';
import { forgetRentalPush } from '@/push/registration';
import { savedRentals, type SavedRental } from '@/storage/saved-rentals';
import { useTheme } from '@/theme';

// One saved rental: its name once Hold has said it, and when this phone last opened it. Removing it forgets the link
// on this phone only: a context menu on iOS, a long press on Android.
export function SavedRentalRow({ rental, first }: { rental: SavedRental; first: boolean }) {
  const t = useTranslations('rentals');
  const common = useTranslations('common');
  const format = useFormatter();
  const { color } = useTheme();
  const title = rental.title ?? t('untitled');
  const opened = t('savedOn', { date: format.dateTime(new Date(rental.openedAt), { dateStyle: 'medium' }) });
  const api = useApi();
  // Hold forgets this phone's notifications for the rental too.
  const remove = () => void Promise.all([savedRentals.remove(rental.token), forgetRentalPush(api, rental.token)]);
  const confirmRemove = () =>
    Alert.alert(t('remove'), title, [
      { text: t('remove'), style: 'destructive', onPress: remove },
      { text: common('cancel'), style: 'cancel' },
    ]);
  return (
    <Link href={`/r/${rental.token}`} asChild>
      <Link.Trigger>
        <Pressable
          role="button"
          aria-label={`${title}, ${opened}`}
          onLongPress={process.env.EXPO_OS === 'android' ? confirmRemove : undefined}
          className={`min-h-touch flex-row items-center gap-3 px-4 py-3.5 active:bg-accent ${first ? '' : 'border-t border-border'}`}
        >
          <Icon name="rental" color={color.mutedForeground} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="bodyStrong" numberOfLines={2}>
              {title}
            </Text>
            <Text variant="small" tone="muted">
              {opened}
            </Text>
          </View>
          <Icon name="forward" color={color.mutedForeground} size={18} />
        </Pressable>
      </Link.Trigger>
      <Link.Menu>
        <Link.MenuAction title={t('remove')} icon="trash" destructive onPress={remove} />
      </Link.Menu>
    </Link>
  );
}
