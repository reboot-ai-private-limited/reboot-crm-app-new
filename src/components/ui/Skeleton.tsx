import { useEffect, useState } from 'react';
import { Animated, DimensionValue, Easing, StyleSheet, View, ViewStyle } from 'react-native';

import { colors } from '@/theme';

/** A grey block that gently pulses: stands in for text or a shape while the real content loads. */
export function SkeletonBlock({ width = '100%', height = 12, radius = 6, style }: { width?: DimensionValue; height?: number; radius?: number; style?: ViewStyle }) {
  const [opacity] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.slateSoft, opacity }, style]} />;
}

/** The shape of one lead card (name, sub line, status and priority chips) while the leads load. */
export function LeadCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 8 }}>
          <SkeletonBlock width="60%" height={16} />
          <SkeletonBlock width="80%" height={12} />
        </View>
        <SkeletonBlock width={34} height={34} radius={10} />
      </View>
      <View style={styles.chips}>
        <SkeletonBlock width={78} height={22} radius={11} />
        <SkeletonBlock width={52} height={22} radius={11} />
        <View style={{ flex: 1 }} />
        <SkeletonBlock width={44} height={12} />
      </View>
    </View>
  );
}

/** A column of card skeletons. `padded` (default) adds the 20px side gutter; pass false inside a screen that already has one. */
export function LeadListSkeleton({ count = 6, padded = true }: { count?: number; padded?: boolean }) {
  return (
    <View style={[styles.list, padded ? null : { paddingHorizontal: 0 }]} accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <LeadCardSkeleton key={i} />
      ))}
    </View>
  );
}

/** Any list of cards (alerts, customers, follow-ups, proposals, meetings...). */
export const ListSkeleton = LeadListSkeleton;

/** Number tiles in two columns, then a few cards: for the dashboards and the Home / Team tabs. */
export function StatsSkeleton({ padded = false }: { padded?: boolean }) {
  return (
    <View style={[{ gap: 12 }, padded ? { paddingHorizontal: 20 } : null]} accessibilityLabel="Loading">
      <View style={styles.tiles}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.card, styles.tile]}>
            <SkeletonBlock width={28} height={28} radius={8} />
            <SkeletonBlock width="50%" height={22} />
            <SkeletonBlock width="75%" height={11} />
          </View>
        ))}
      </View>
      <LeadListSkeleton count={3} padded={false} />
    </View>
  );
}

/** A page of one record: a header card with a title, then a few sections. For the detail screens. */
export function DetailSkeleton({ padded = false }: { padded?: boolean }) {
  return (
    <View style={[{ gap: 12 }, padded ? { paddingHorizontal: 20 } : null]} accessibilityLabel="Loading">
      <View style={[styles.card, { gap: 12 }]}>
        <SkeletonBlock width="65%" height={20} />
        <SkeletonBlock width="45%" height={13} />
        <View style={styles.chips}>
          <SkeletonBlock width={80} height={24} radius={12} />
          <SkeletonBlock width={56} height={24} radius={12} />
        </View>
      </View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.card, { gap: 10 }]}>
          <SkeletonBlock width="35%" height={14} />
          <SkeletonBlock height={12} />
          <SkeletonBlock width="85%" height={12} />
          <SkeletonBlock width="60%" height={12} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, gap: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexBasis: '47%', flexGrow: 1, gap: 10 },
});
