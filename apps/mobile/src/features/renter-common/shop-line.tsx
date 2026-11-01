import { View } from 'react-native';
import { SampleLabel, Text } from '@/components/ui';

// Above a renter screen: whose rental this is, and whether it is a sample for the demonstration.
export function ShopLine({ shopName, simulated = false }: { shopName: string; simulated?: boolean }) {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text variant="label" tone="muted" className="shrink">
        {shopName}
      </Text>
      {simulated ? <SampleLabel /> : null}
    </View>
  );
}
