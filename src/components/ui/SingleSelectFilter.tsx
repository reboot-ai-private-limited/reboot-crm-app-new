import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

/** Small dropdown button: shows the chosen option and opens a sheet to pick one. */
export function SingleSelectFilter({
  title,
  options,
  value,
  onChange,
}: {
  /** Sheet title. */
  title: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.box}>
        <AppText variant="label" weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>
          {value}
        </AppText>
        <Icon name="chevD" size={16} color="textSubtle" />
      </Pressable>

      <Sheet visible={open} title={title} onClose={() => setOpen(false)}>
        <FlatList
          data={[...options]}
          keyExtractor={(o) => o}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => {
            const on = item === value;
            return (
              <Pressable
                onPress={() => {
                  onChange(item);
                  setOpen(false);
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
    </>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  sep: { height: 1, backgroundColor: colors.border },
});
