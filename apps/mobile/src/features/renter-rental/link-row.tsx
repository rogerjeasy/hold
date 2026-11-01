import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Link, type Href } from 'expo-router';
import { Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme';

type LinkRowProps = { href: Href; icon: IconName; title: string; detail?: string; aside?: ReactNode };

// One row of a grouped list that opens another page of the rental: an icon, what it is, a line about it, a chevron.
// Rows are separated by a hairline above each; the list hides the first under its heading's.
export function LinkRow({ href, icon, title, detail, aside }: LinkRowProps) {
  const { color } = useTheme();
  return (
    <Link href={href} asChild>
      <Pressable
        role="button"
        aria-label={detail === undefined ? title : `${title}, ${detail}`}
        className="min-h-touch flex-row items-center gap-3 border-t border-border px-4 py-3.5 active:bg-accent"
      >
        <Icon name={icon} color={color.primary} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="bodyStrong">{title}</Text>
          {detail === undefined ? null : (
            <Text variant="small" tone="muted">
              {detail}
            </Text>
          )}
          {aside}
        </View>
        <Icon name="forward" color={color.mutedForeground} size={18} />
      </Pressable>
    </Link>
  );
}
