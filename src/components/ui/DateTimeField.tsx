import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

export function formatDateTime(d: Date) {
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Date + time picker. Android: native date then time dialogs. iOS: inline picker in a sheet. */
export function DateTimeField({ label, value, onChange, minimumDate }: { label: string; value: Date; onChange: (d: Date) => void; minimumDate?: Date }) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        minimumDate,
        onValueChange: (_e, date) => {
          DateTimePickerAndroid.open({
            value: date,
            mode: 'time',
            onValueChange: (_e2, time) => {
              const d = new Date(date);
              d.setHours(time.getHours(), time.getMinutes(), 0, 0);
              onChange(d);
            },
          });
        },
      });
    } else {
      setDraft(value);
      setIosOpen(true);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      <Pressable onPress={open} style={styles.box}>
        <Icon name="calendar" size={18} color="textSubtle" />
        <AppText style={{ flex: 1 }}>{formatDateTime(value)}</AppText>
        <Icon name="chevD" size={18} color="textSubtle" />
      </Pressable>

      {Platform.OS === 'ios' ? (
        <Sheet visible={iosOpen} title={label} onClose={() => setIosOpen(false)}>
          <DateTimePicker value={draft} mode="datetime" display="inline" minimumDate={minimumDate} onValueChange={(_e, d) => setDraft(d)} />
          <Button
            label="Done"
            onPress={() => {
              onChange(draft);
              setIosOpen(false);
            }}
          />
        </Sheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
});
