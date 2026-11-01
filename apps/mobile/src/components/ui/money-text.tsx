import { formatMoney, type Money, type MoneyStyle } from '@hold/domain';
import { useLocale } from 'use-intl';
import { Text, type TextProps } from './text';

// An amount, from whole cents, in the phone's language, set in figures so columns line up. The formatting is the
// domain's, the same the web and the emails use.
export function MoneyText({ money, style = 'exact', variant = 'bodyStrong', ...text }: Omit<TextProps, 'children' | 'style'> & { money: Money; style?: MoneyStyle }) {
  const locale = useLocale();
  return (
    <Text {...text} variant={variant} selectable style={{ fontVariant: ['tabular-nums'] }}>
      {formatMoney(money, locale, style)}
    </Text>
  );
}
