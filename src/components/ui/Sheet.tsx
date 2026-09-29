import { ReactNode, useEffect, useState } from 'react';
import { Animated, Dimensions, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '@/theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

const SCREEN_H = Dimensions.get('window').height;
const OPEN_MS = 280;
const CLOSE_MS = 220;

/**
 * Bottom sheet. The dark backdrop fades in place; only the sheet slides up.
 * (A plain Modal with animationType="slide" slides the backdrop too.)
 */
export function Sheet({
  visible,
  title,
  onClose,
  children,
  fullHeight,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  fullHeight?: boolean;
}) {
  const insets = useSafeAreaInsets();
  // Stay mounted while the close animation runs.
  const [mounted, setMounted] = useState(visible);
  const progress = useState(() => new Animated.Value(0))[0];

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? OPEN_MS : CLOSE_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, mounted, progress]);

  if (!mounted) return null;

  const backdropOpacity = progress;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H, 0] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY }] }, fullHeight && { height: '85%' }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <AppText variant="section" style={{ flex: 1 }}>
              {title}
            </AppText>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
              <Icon name="x" size={18} color="textMuted" />
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl + 4, borderTopRightRadius: radius.xl + 4, paddingHorizontal: 20, gap: 16 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 10 },
  head: { flexDirection: 'row', alignItems: 'center' },
  close: { padding: 6, borderRadius: 16, backgroundColor: colors.slateSoft },
});
