import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RANGES, rangeDates } from '@/lib/reporting';
import { colors, radius } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { DateTimeField } from './DateTimeField';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

const CUSTOM = 'Custom range';
const PRESETS = [...RANGES, CUSTOM] as const;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const short = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * Date dropdown: pick Today / This month / Last 7 days / … or a custom From–To range.
 * Starts on Today. Calls `onChange` with whole-day dates.
 */
export function DateRangeFilter({ from, to, onChange }: { from: Date; to: Date; onChange: (from: Date, to: Date) => void }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<string>('Today');
  // Custom range being edited in the sheet.
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  const custom = preset === CUSTOM;
  const label = custom ? (from.getTime() === to.getTime() ? short(from) : `${short(from)} – ${short(to)}`) : preset;

  const pick = (p: string) => {
    if (p === CUSTOM) {
      setDraftFrom(from);
      setDraftTo(to);
      setPreset(CUSTOM);
      return; // stay open to choose the dates
    }
    const r = rangeDates(p as (typeof RANGES)[number]);
    setPreset(p);
    onChange(startOfDay(r.start), startOfDay(r.end));
    setOpen(false);
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.box}>
        <Icon name="calendar" size={15} color="textSubtle" />
        <AppText variant="label" weight="600" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </AppText>
        <Icon name="chevD" size={16} color="textSubtle" />
      </Pressable>

      <Sheet visible={open} title="Date" onClose={() => setOpen(false)}>
        <View>
          {PRESETS.map((p, i) => {
            const on = p === preset;
            return (
              <Pressable key={p} onPress={() => pick(p)} style={[styles.option, i > 0 && styles.sep]}>
                <AppText weight={on ? '600' : '400'} color={on ? 'primary' : 'text'} style={{ flex: 1 }}>
                  {p}
                </AppText>
                {on ? <Icon name="check" size={18} color="primary" /> : null}
              </Pressable>
            );
          })}
        </View>
        {custom ? (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <DateTimeField
                  label="From"
                  dateOnly
                  value={draftFrom}
                  maximumDate={new Date()}
                  onChange={(d) => {
                    const day = startOfDay(d);
                    setDraftFrom(day);
                    if (day > draftTo) setDraftTo(day);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <DateTimeField label="To" dateOnly value={draftTo} minimumDate={draftFrom} maximumDate={new Date()} onChange={(d) => setDraftTo(startOfDay(d))} />
              </View>
            </View>
            <Button
              label="Apply"
              onPress={() => {
                onChange(draftFrom, draftTo);
                setOpen(false);
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  sep: { borderTopWidth: 1, borderTopColor: colors.border },
});
