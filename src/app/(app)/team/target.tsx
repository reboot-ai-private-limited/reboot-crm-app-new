import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Field, Header } from '@/components/ui/layout';
import { SelectField } from '@/components/ui/SelectField';
import { EmployeeOption, fetchEmployees, fetchTarget, ROLE_LABEL, saveTarget } from '@/lib/reporting';
import { colors } from '@/theme';

const digits = (t: string) => t.replace(/\D/g, '');

/** Current month and the 6 before / 6 after it, as pickable "October 2026" labels. */
function monthOptions() {
  const now = new Date();
  return Array.from({ length: 13 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 6 + i, 1);
    return { label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), year: d.getFullYear(), month: d.getMonth() + 1 };
  });
}

// Admin: POST /reporting/targets (creates or replaces the month's target, same as the web "Add Target").
export default function AddTarget() {
  const router = useRouter();
  const months = useMemo(() => monthOptions(), []);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [listError, setListError] = useState('');
  const [employeeLabel, setEmployeeLabel] = useState('');
  const [monthLabel, setMonthLabel] = useState(months[6].label);
  const [target, setTarget] = useState('');
  const [achieved, setAchieved] = useState('');
  const [collection, setCollection] = useState('');
  // Existing target lookup for the chosen employee + month; the form stays hidden until it has answered.
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const [existing, setExisting] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    fetchEmployees()
      .then(setEmployees)
      .catch((e: Error) => setListError(e.message));
  }, []);

  const labelOf = (e: EmployeeOption) => `${e.fullName} · ${ROLE_LABEL[e.role] ?? e.role}`;
  const employee = employees.find((e) => labelOf(e) === employeeLabel);
  const picked = months.find((m) => m.label === monthLabel);
  const key = employee && picked ? `${employee.id}|${picked.year}|${picked.month}` : null;
  const checking = !!key && checkedKey !== key;

  // Load the saved target (if any) so it can be edited instead of overwritten blindly.
  useEffect(() => {
    if (!employee || !picked || !key) return;
    let current = true;
    fetchTarget(employee.id, picked.year, picked.month)
      .then((t) => {
        if (!current) return;
        setTarget(t ? String(t.targetRevenue ?? '') : '');
        setAchieved(t ? String(t.achievedAmount ?? '') : '');
        setCollection(t ? String(t.collectionAmount ?? '') : '');
        setExisting(!!t);
        setCheckError('');
      })
      .catch((e: Error) => {
        if (current) setCheckError(e.message);
      })
      .finally(() => {
        if (current) setCheckedKey(key);
      });
    return () => {
      current = false;
    };
    // `employee` / `picked` are derived from `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const submit = async () => {
    setTouched(true);
    if (!employee || !picked || !target) return;
    setSaving(true);
    setServerError('');
    try {
      await saveTarget({
        employeeId: employee.id,
        year: picked.year,
        month: picked.month,
        targetRevenue: Number(target),
        achievedAmount: Number(achieved || 0),
        collectionAmount: Number(collection || 0),
      });
      router.back(); // the Team tab reloads when it comes back into view
    } catch (err) {
      setServerError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const ready = !!key && !checking && !checkError;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Header title="Set revenue target" subtitle="Monthly target for an employee" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SelectField label="Employee" required icon="user" placeholder="Choose employee" value={employeeLabel} options={employees.map(labelOf)} onChange={setEmployeeLabel} />
          <SelectField label="Month and year" required icon="calendar" value={monthLabel} options={months.map((m) => m.label)} onChange={setMonthLabel} />

          {listError ? (
            <View style={styles.error}>
              <Icon name="alert" size={16} color="danger" />
              <AppText variant="label" color="danger" style={{ flex: 1 }}>
                {listError}
              </AppText>
            </View>
          ) : null}

          {!key ? (
            <View style={styles.note}>
              <AppText color="textMuted" align="center">
                Select an employee and month to continue.
              </AppText>
            </View>
          ) : checking ? (
            <View style={styles.note}>
              <ActivityIndicator color={colors.primary} />
              <AppText color="textMuted" align="center">
                Checking existing target…
              </AppText>
            </View>
          ) : checkError ? (
            <View style={styles.error}>
              <Icon name="alert" size={16} color="danger" />
              <AppText variant="label" color="danger" style={{ flex: 1 }}>
                Could not check for an existing target ({checkError}). To avoid overwriting data, try again later.
              </AppText>
            </View>
          ) : (
            <>
              {existing ? (
                <AppText variant="caption" color="warning">
                  A target already exists for this month. Saving will replace it.
                </AppText>
              ) : null}
              <Field
                label="Monthly target (₹)"
                required
                icon="rupee"
                placeholder="e.g. 100000"
                value={target}
                onChangeText={(t) => setTarget(digits(t))}
                keyboardType="number-pad"
                error={touched && !target ? 'Enter a target amount' : undefined}
              />
              <Field label="Achieved amount (₹), optional" icon="rupee" placeholder="e.g. 50000" value={achieved} onChangeText={(t) => setAchieved(digits(t))} keyboardType="number-pad" />
              <Field label="Collection amount (₹), optional" icon="rupee" placeholder="e.g. 20000" value={collection} onChangeText={(t) => setCollection(digits(t))} keyboardType="number-pad" />
            </>
          )}

          {serverError ? (
            <View style={styles.error}>
              <Icon name="alert" size={16} color="danger" />
              <AppText variant="label" color="danger" style={{ flex: 1 }}>
                {serverError}
              </AppText>
            </View>
          ) : null}
        </ScrollView>
        <View style={styles.footer}>
          <Button label={saving ? 'Saving…' : 'Save target'} icon="check" flex loading={saving} disabled={!ready} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 4, gap: 14 },
  footer: { flexDirection: 'row', padding: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  note: { alignItems: 'center', gap: 10, padding: 20, borderRadius: 12, backgroundColor: colors.slateSoft },
  error: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: colors.dangerSoft },
});
