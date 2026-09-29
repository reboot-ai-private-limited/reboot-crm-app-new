import type { BottomTabBarButtonProps } from 'expo-router/build/react-navigation/bottom-tabs/types';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';

import { colors } from '@/theme';
import { Icon, IconName } from './Icon';

/**
 * Silent tab button: no Android ripple and no system click sound.
 * A light press-in scale gives feedback instead.
 */
export function TabButton({ children, style, onPress, onLongPress, accessibilityState, accessibilityLabel, testID }: BottomTabBarButtonProps) {
  const scale = useState(() => new Animated.Value(1))[0];
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => to(0.92)}
      onPressOut={() => to(1)}
      android_disableSound
      android_ripple={null}
      accessibilityRole="tab"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[style, styles.button]}>
      <Animated.View style={[styles.inner, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Icon with an animated pill behind it and a small lift when the tab becomes active. */
export function AnimatedTabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const p = useState(() => new Animated.Value(focused ? 1 : 0))[0];

  useEffect(() => {
    Animated.timing(p, {
      toValue: focused ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [focused, p]);

  const pillScale = p.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const lift = p.interpolate({ inputRange: [0, 1], outputRange: [0, -1] });

  return (
    <Animated.View style={[styles.iconWrap, { transform: [{ translateY: lift }] }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.pill, { opacity: p, transform: [{ scaleX: pillScale }] }]} />
      <Icon name={name} size={22} color={focused ? 'primary' : 'textSubtle'} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: { flex: 1, backgroundColor: 'transparent' },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { width: 56, height: 30, alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: 15, backgroundColor: colors.primarySoft },
});
