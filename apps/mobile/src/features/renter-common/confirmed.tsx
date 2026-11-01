import { View } from 'react-native';
import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';

// What Hold confirmed it did, read out as it appears. The words carry the meaning; the tick only repeats it.
export function Confirmed({ text }: { text: string }) {
  const { color } = useTheme();
  return (
    <View role="status" accessible accessibilityLiveRegion="polite" className="flex-row gap-2">
      <Icon name="success" color={color.success} size={18} />
      <Text selectable className="min-w-0 flex-1">
        {text}
      </Text>
    </View>
  );
}
