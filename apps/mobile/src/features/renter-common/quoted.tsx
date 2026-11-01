import { View } from 'react-native';
import { Text } from '@/components/ui';

// Someone's own words (the renter's, the shop's, an assistant's): shown as they wrote them, as plain text, set apart
// by a rule so they are never read as Hold's.
export function Quoted({ text, caption }: { text: string; caption?: string }) {
  return (
    <View className="gap-1">
      {caption === undefined ? null : (
        <Text variant="small" tone="muted">
          {caption}
        </Text>
      )}
      <View className="border-l-2 border-border-strong pl-3">
        <Text selectable>{text}</Text>
      </View>
    </View>
  );
}
