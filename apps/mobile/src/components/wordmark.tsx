import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { wordmark } from '@hold/design-tokens';
import { Text } from '@/components/ui';

// The logo: "hold" in lowercase, Archivo 800, with the inside of the o filled orange. A disc sits behind the o,
// larger than its counter and smaller than its bowl, so only the counter shows it. Every size follows the font size,
// as the web's em-based held-o does. The letters are hidden from screen readers; the whole reads once as "Hold".
export function Wordmark({ size, tone = 'default' }: { size: number; tone?: 'default' | 'onContrast' }) {
  const t = useTranslations('brand');
  const tracking = size * wordmark.tracking;
  const letters = { fontSize: size, lineHeight: size * 1.1, letterSpacing: tracking };
  // The o's counter centres a little under half the x-height above the baseline; the disc sits there.
  const disc = { width: size * wordmark.disc.width, height: size * wordmark.disc.height };
  return (
    <View accessible role="img" aria-label={t('name')} className="flex-row items-end self-start">
      <Text variant="display" tone={tone} style={letters} allowFontScaling={false} aria-hidden>
        h
      </Text>
      <View aria-hidden className="items-center justify-end">
        <View
          className="absolute rounded-full bg-primary"
          style={{ ...disc, bottom: size * (0.1 + 0.155 - wordmark.disc.lift), transform: [{ translateX: tracking / -2 }] }}
        />
        <Text variant="display" tone={tone} style={letters} allowFontScaling={false}>
          o
        </Text>
      </View>
      <Text variant="display" tone={tone} style={letters} allowFontScaling={false} aria-hidden>
        ld
      </Text>
    </View>
  );
}
