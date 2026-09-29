import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';
import { AppText } from './AppText';
import { Icon, IconName } from './Icon';
import { Field } from './layout';
import { Sheet } from './Sheet';

/** Tappable field that opens a searchable list (used for long lists like cities and categories). */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select',
  required,
  icon,
  error,
  flex,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  icon?: IconName;
  error?: string;
  flex?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.toLowerCase().includes(s)) : options;
  }, [q, options]);

  const close = () => {
    setOpen(false);
    setQ('');
  };

  return (
    <View style={[{ gap: 6 }, flex ? { flex: 1 } : null]}>
      <AppText variant="label" color="textMuted">
        {label}
        {required ? ' *' : ''}
      </AppText>
      <Pressable onPress={() => setOpen(true)} style={[styles.box, error ? { borderColor: colors.danger } : null]}>
        {icon ? <Icon name={icon} size={18} color="textSubtle" /> : null}
        <AppText numberOfLines={1} color={value ? 'text' : 'textSubtle'} style={{ flex: 1 }}>
          {value || placeholder}
        </AppText>
        <Icon name="chevD" size={18} color="textSubtle" />
      </Pressable>
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}

      <Sheet visible={open} title={label} onClose={close} fullHeight>
        <Field icon="search" placeholder={`Search ${label.toLowerCase()}`} value={q} onChangeText={setQ} />
        <FlatList
          data={list}
          keyExtractor={(o) => o}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <AppText color="textMuted" align="center" style={{ marginTop: 24 }}>
              No matches.
            </AppText>
          }
          renderItem={({ item }) => {
            const on = item === value;
            return (
              <Pressable
                onPress={() => {
                  onChange(item);
                  close();
                }}
                style={styles.option}>
                <AppText weight={on ? '600' : '400'} color={on ? 'primary' : 'text'} style={{ flex: 1 }}>
                  {item}
                </AppText>
                {on ? <Icon name="check" size={18} color="primary" /> : null}
              </Pressable>
            );
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  sep: { height: 1, backgroundColor: colors.border },
});
