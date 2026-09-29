import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ColorName, colors, radius } from '@/theme';
import { AppText } from './AppText';
import { Icon, IconName } from './Icon';

type Variant = 'primary' | 'soft' | 'outline' | 'danger' | 'success';

const map: Record<Variant, { bg: ColorName; fg: ColorName; border?: boolean }> = {
  primary: { bg: 'primary', fg: 'surface' },
  soft: { bg: 'primarySoft', fg: 'primary' },
  outline: { bg: 'surface', fg: 'primary', border: true },
  danger: { bg: 'dangerSoft', fg: 'danger' },
  success: { bg: 'successSoft', fg: 'success' },
};

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  small?: boolean;
  flex?: boolean;
  disabled?: boolean;
  loading?: boolean;
};

export function Button({ label, onPress, variant = 'primary', icon, small, flex, disabled, loading }: Props) {
  const v = map[variant];
  const inactive = disabled || loading || !onPress;
  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        small ? styles.small : styles.large,
        { backgroundColor: colors[v.bg], opacity: disabled || !onPress ? 0.5 : pressed ? 0.85 : 1 },
        v.border ? { borderWidth: 1, borderColor: colors.border } : null,
        flex ? { flex: 1 } : null,
      ]}>
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={colors[v.fg]} />
        ) : icon ? (
          <Icon name={icon} size={small ? 15 : 18} color={v.fg} />
        ) : null}
        <AppText weight="600" color={v.fg} style={{ fontSize: small ? 13 : 15 }}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  large: { paddingVertical: 16, paddingHorizontal: 20, borderRadius: radius.md + 2 },
  small: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: radius.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
