import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme';
import { AppText } from './AppText';
import { Icon, IconName } from './Icon';

// Placeholder for tabs whose screen has not been approved/built yet. Shows no fake data.
export function ComingSoon({ title, icon }: { title: string; icon: IconName }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 10 }}>
        <AppText variant="heading">{title}</AppText>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }}>
        <Icon name={icon} size={36} color="textSubtle" />
        <AppText color="textMuted" align="center">
          This screen is not built yet.
        </AppText>
      </View>
    </SafeAreaView>
  );
}
