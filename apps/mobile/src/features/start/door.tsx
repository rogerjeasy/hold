import { Pressable, View } from 'react-native';
import { Link, type Href } from 'expo-router';
import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';

// One way in from the start screen. The renter's door is ink, the shop's is paper, as on the web's home page.
const SURFACE = {
  contrast: { box: 'bg-contrast active:opacity-90', text: 'onContrast', icon: 'contrastForeground' },
  card: { box: 'border border-border-strong bg-card active:bg-accent', text: 'default', icon: 'foreground' },
} as const;

type DoorProps = { href: Href; surface: keyof typeof SURFACE; label: string; title: string; body: string; note?: string };

export function Door({ href, surface, label, title, body, note }: DoorProps) {
  const { color } = useTheme();
  const look = SURFACE[surface];
  return (
    <Link href={href} asChild>
      <Pressable role="button" aria-label={title} accessibilityHint={note ? `${body} ${note}` : body} className={`min-h-touch flex-row items-center gap-4 rounded-lg p-5 ${look.box}`}>
        <View className="min-w-0 flex-1 gap-1.5">
          <Text variant="tag" tone={look.text} className="opacity-70">
            {label}
          </Text>
          <Text variant="title" tone={look.text}>
            {title}
          </Text>
          <Text tone={look.text} className="opacity-80">
            {body}
          </Text>
          {note ? (
            <Text variant="label" tone={surface === 'contrast' ? 'onContrast' : 'primary'} className="mt-1">
              {note}
            </Text>
          ) : null}
        </View>
        <Icon name="forward" color={color[look.icon]} size={20} />
      </Pressable>
    </Link>
  );
}
