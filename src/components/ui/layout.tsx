import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, TextInput, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ColorName, colors, gradient, radius } from '@/theme';
import { AppText } from './AppText';
import { Icon, IconName } from './Icon';

/** Screen shell: safe area + light background. Set `scroll` for long content. */
export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function IconButton({ icon, onPress }: { icon: IconName; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.iconBtn}>
      <Icon name={icon} size={20} />
    </Pressable>
  );
}

export function Header({
  title,
  subtitle,
  back,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  /** Custom back action; defaults to going back, or to the home route when there is no history. */
  onBack?: () => void;
}) {
  const router = useRouter();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={styles.header}>
      {back ? <IconButton icon="chevL" onPress={goBack} /> : null}
      <View style={{ flex: 1 }}>
        <AppText variant="heading">{title}</AppText>
        {subtitle ? (
          <AppText variant="label" color="textMuted" weight="400">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  onLongPress,
  borderColor,
}: {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  onLongPress?: () => void;
  borderColor?: ColorName;
}) {
  const s = [styles.card, borderColor ? { borderColor: colors[borderColor] } : null, style];
  if (onPress)
    return (
      <Pressable onPress={onPress} onLongPress={onLongPress} style={s}>
        {children}
      </Pressable>
    );
  return <View style={s}>{children}</View>;
}

export function GradientCard({ children }: { children: ReactNode }) {
  return (
    <LinearGradient colors={[...gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
      {children}
    </LinearGradient>
  );
}

export function SectionHeader({ title, link, onPress }: { title: string; link?: string; onPress?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="section">{title}</AppText>
      {link ? (
        <Pressable onPress={onPress}>
          <AppText variant="label" color="primary">
            {link}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = (name || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <AppText weight="600" color="primary" style={{ fontSize: size * 0.36 }}>
        {initials}
      </AppText>
    </View>
  );
}

export function IconBadge({ icon, tone }: { icon: IconName; tone: 'primary' | 'purple' | 'warning' | 'success' | 'danger' | 'slate' }) {
  const soft = { primary: 'primarySoft', purple: 'purpleSoft', warning: 'warningSoft', success: 'successSoft', danger: 'dangerSoft', slate: 'slateSoft' } as const;
  return (
    <View style={[styles.iconBadge, { backgroundColor: colors[soft[tone]] }]}>
      <Icon name={icon} size={20} color={tone} />
    </View>
  );
}

export function Segmented({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.segment}>
      {items.map((i) => {
        const on = i === value;
        return (
          <Pressable key={i} onPress={() => onChange(i)} style={[styles.segItem, on && { backgroundColor: colors.surface }]}>
            <AppText variant="label" weight={on ? '600' : '500'} color={on ? 'primary' : 'textMuted'}>
              {i}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FilterChips({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {items.map((i) => {
        const on = i === value;
        return (
          <Pressable key={i} onPress={() => onChange(i)} style={[styles.pill, on ? { backgroundColor: colors.primary } : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
            <AppText variant="label" color={on ? 'surface' : 'textMuted'}>
              {i}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Track({ pct, tone = 'primary' }: { pct: number; tone?: ColorName }) {
  return (
    <View style={styles.track}>
      <View style={{ width: `${Math.max(2, Math.min(100, pct * 100))}%`, height: '100%', borderRadius: 4, backgroundColor: colors[tone] }} />
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  icon,
  required,
  multiline,
  keyboardType,
  maxLength,
  flex,
  error,
  autoCapitalize,
  large,
}: {
  label?: string;
  value: string;
  onChangeText?: (t: string) => void;
  placeholder?: string;
  icon?: IconName;
  required?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'email-address' | 'number-pad';
  maxLength?: number;
  /** Share a Row with other fields. Leave off in a column, or the field stretches vertically. */
  flex?: boolean;
  error?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** Taller input (60dp) for focal forms such as login. */
  large?: boolean;
}) {
  return (
    <View style={[{ gap: 6 }, flex ? { flex: 1 } : null]}>
      {label ? (
        <AppText variant="label" color="textMuted">
          {label}
          {required ? ' *' : ''}
        </AppText>
      ) : null}
      <View style={[styles.field, large && { height: 60 }, multiline && { height: 120, alignItems: 'flex-start' }, error ? { borderColor: colors.danger } : null]}>
        {icon ? <Icon name={icon} size={18} color="textSubtle" /> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textSubtle}
          multiline={multiline}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          style={[styles.input, multiline && { textAlignVertical: 'top', height: '100%' }]}
        />
      </View>
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

export function Row({ children, gap = 12, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 8, gap: 16 },
  footer: { padding: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  iconBtn: { padding: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14 },
  gradient: { borderRadius: radius.xl, padding: 20, gap: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avatar: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  // alignSelf keeps the badge icon-sized inside column layouts (it would otherwise stretch full width).
  iconBadge: { padding: 10, borderRadius: radius.md, alignSelf: 'flex-start' },
  segment: { flexDirection: 'row', backgroundColor: colors.slateSoft, borderRadius: radius.md, padding: 4, gap: 4 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  track: { height: 6, borderRadius: 4, backgroundColor: colors.slateSoft, overflow: 'hidden' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  input: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },
});
