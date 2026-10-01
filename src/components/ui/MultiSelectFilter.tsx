import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';
import { Field } from './layout';
import { Sheet } from './Sheet';

export type FilterOption = { value: string; label: string; count?: number };

/**
 * Dropdown that opens a sheet where several options can be ticked. Shows how many are selected.
 * Lists longer than 8 get a search box.
 */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const searchable = options.length > 8;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
  }, [q, options]);

  const close = () => {
    setOpen(false);
    setQ('');
  };
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const on = selected.length > 0;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.box, on && styles.boxOn]}>
        <AppText variant="label" weight={on ? '600' : '400'} color={on ? 'primary' : 'textMuted'} numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
          {on ? ` · ${selected.length}` : ''}
        </AppText>
        <Icon name="chevD" size={16} color={on ? 'primary' : 'textSubtle'} />
      </Pressable>

      <Sheet visible={open} title={label} onClose={close} fullHeight={searchable}>
        {searchable ? <Field icon="search" placeholder={`Search ${label.toLowerCase()}`} value={q} onChangeText={setQ} /> : null}
        <FlatList
          data={list}
          keyExtractor={(o) => o.value}
          keyboardShouldPersistTaps="handled"
          style={searchable ? { flex: 1 } : undefined}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <AppText color="textMuted" align="center" style={{ marginVertical: 24 }}>
              {options.length === 0 ? `No ${label.toLowerCase()} in the current leads.` : 'No matches.'}
            </AppText>
          }
          renderItem={({ item }) => {
            const checked = selected.includes(item.value);
            return (
              <Pressable onPress={() => toggle(item.value)} style={styles.option}>
                <View style={[styles.check, checked && styles.checkOn]}>{checked ? <Icon name="check" size={14} color="surface" /> : null}</View>
                <AppText weight={checked ? '600' : '400'} style={{ flex: 1 }}>
                  {item.label}
                </AppText>
                {item.count !== undefined ? (
                  <AppText variant="label" color="textMuted" weight="400">
                    {item.count}
                  </AppText>
                ) : null}
              </Pressable>
            );
          }}
        />
        <View style={styles.footer}>
          <Button label="Clear" variant="outline" flex disabled={!on} onPress={() => onChange([])} />
          <Button label="Done" flex onPress={close} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  box: { minWidth: 104, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  boxOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  sep: { height: 1, backgroundColor: colors.border },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  footer: { flexDirection: 'row', gap: 12, paddingTop: 12 },
});
