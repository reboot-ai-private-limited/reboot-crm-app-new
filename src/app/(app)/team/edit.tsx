import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Field, Header, Segmented } from '@/components/ui/layout';
import { DetailSkeleton } from '@/components/ui/Skeleton';
import { EmployeeDetails, EmployeeRole, fetchEmployee, ROLE_LABEL, updateEmployee } from '@/lib/reporting';
import { colors } from '@/theme';

const ROLES: EmployeeRole[] = ['BusinessAdvisor', 'FieldSales', 'Admin'];
const STATUSES = ['Active', 'Inactive', 'Terminated'] as const;
type Status = (typeof STATUSES)[number];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Values = { fullName: string; mobile: string; alternateMobile: string; email: string };
type Errors = Partial<Record<keyof Values, string>>;

// Same rules as the backend updateEmployeeSchema (and the web Edit Employee form).
function validate(v: Values): Errors {
  const e: Errors = {};
  if (v.fullName.trim().length < 2) e.fullName = 'Enter at least 2 characters';
  if (!/^\d{10}$/.test(v.mobile)) e.mobile = 'Mobile must be exactly 10 digits';
  if (v.alternateMobile && !/^\d{10}$/.test(v.alternateMobile)) e.alternateMobile = 'Must be exactly 10 digits';
  if (!EMAIL.test(v.email.trim())) e.email = 'Enter a valid email';
  return e;
}

/**
 * Admin: edit an employee's basic details, designation and status (PATCH /employees/:id). The address, guardian, joining date and documents
 * are still edited on the web. A draft has no status here: it is made Active by submitting it on the web. Making an Active employee Inactive
 * or Terminated stops their login and sends all their leads back to the lead pool.
 */
export default function EditEmployee() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [employee, setEmployee] = useState<EmployeeDetails | null>(null);
  const [loadError, setLoadError] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [alternateMobile, setAlternateMobile] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<EmployeeRole>('BusinessAdvisor');
  const [status, setStatus] = useState<Status>('Active');
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    let stale = false;
    fetchEmployee(id)
      .then((e) => {
        if (stale) return;
        setEmployee(e);
        setFullName(e.fullName);
        setMobile(e.mobile);
        setAlternateMobile(e.alternateMobile ?? '');
        setEmail(e.email);
        setRole(e.role);
        if (e.status !== 'Draft') setStatus(e.status);
      })
      .catch((err: Error) => {
        if (!stale) setLoadError(err.message);
      });
    return () => {
      stale = true;
    };
  }, [id]);

  const isDraft = employee?.status === 'Draft';
  const check = (v: Values) => {
    if (touched) setErrors(validate(v));
  };

  const save = async () => {
    setSaving(true);
    setServerError('');
    try {
      await updateEmployee(id, { fullName: fullName.trim(), mobile, alternateMobile, email: email.trim(), role, ...(isDraft ? {} : { status }) });
      router.back(); // the details screen reloads when it comes back into view
    } catch (err) {
      setServerError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const submit = () => {
    setTouched(true);
    const e = validate({ fullName, mobile, alternateMobile, email });
    setErrors(e);
    if (Object.keys(e).length) return;
    // Ending an active employee has consequences, so it is confirmed first.
    if (employee?.status === 'Active' && status !== 'Active') {
      Alert.alert(
        `Make ${fullName.trim() || 'this employee'} ${status}?`,
        'They will not be able to sign in, and all their leads go back to the lead pool.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: status === 'Terminated' ? 'Terminate' : 'Deactivate', style: 'destructive', onPress: () => void save() },
        ],
      );
      return;
    }
    void save();
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Header title="Edit employee" subtitle={employee ? employee.fullName : undefined} back />
      {!employee ? (
        loadError ? (
          <View style={styles.center}>
            <AppText color="danger" align="center">
              {loadError}
            </AppText>
          </View>
        ) : (
          <View style={{ padding: 20 }}>
            <DetailSkeleton />
          </View>
        )
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Field
              label="Full name"
              required
              icon="user"
              value={fullName}
              onChangeText={(t) => {
                setFullName(t);
                check({ fullName: t, mobile, alternateMobile, email });
              }}
              error={errors.fullName}
              autoCapitalize="words"
            />
            <Field
              label="Mobile"
              required
              icon="phone"
              value={mobile}
              onChangeText={(t) => {
                const m = t.replace(/\D/g, '');
                setMobile(m);
                check({ fullName, mobile: m, alternateMobile, email });
              }}
              keyboardType="phone-pad"
              maxLength={10}
              error={errors.mobile}
            />
            <Field
              label="Alternate number"
              icon="phone"
              placeholder="Optional"
              value={alternateMobile}
              onChangeText={(t) => {
                const m = t.replace(/\D/g, '');
                setAlternateMobile(m);
                check({ fullName, mobile, alternateMobile: m, email });
              }}
              keyboardType="phone-pad"
              maxLength={10}
              error={errors.alternateMobile}
            />
            <Field
              label="Email"
              required
              icon="mail"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                check({ fullName, mobile, alternateMobile, email: t });
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
            />

            <View style={{ gap: 6 }}>
              <AppText variant="label" color="textMuted">
                Designation *
              </AppText>
              <Segmented items={ROLES.map((r) => ROLE_LABEL[r])} value={ROLE_LABEL[role]} onChange={(l) => setRole(ROLES.find((r) => ROLE_LABEL[r] === l) ?? 'BusinessAdvisor')} />
            </View>

            {isDraft ? (
              <View style={styles.note}>
                <Icon name="alert" size={16} color="textMuted" />
                <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
                  This employee is a draft and cannot sign in yet. To activate them, finish the details on the web and press Submit & create ID pass.
                </AppText>
              </View>
            ) : (
              <View style={{ gap: 6 }}>
                <AppText variant="label" color="textMuted">
                  Status
                </AppText>
                <Segmented items={[...STATUSES]} value={status} onChange={(s) => setStatus(s as Status)} />
                {status !== 'Active' ? (
                  <AppText variant="caption" color="warning">
                    {status} employees cannot sign in. Saving sends all their leads back to the lead pool.
                  </AppText>
                ) : null}
              </View>
            )}

            <View style={styles.note}>
              <Icon name="alert" size={16} color="textMuted" />
              <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
                The address, guardian, joining date and documents are edited on the web.
              </AppText>
            </View>

            {serverError ? (
              <View style={styles.serverError}>
                <Icon name="alert" size={16} color="danger" />
                <AppText variant="label" color="danger" style={{ flex: 1 }}>
                  {serverError}
                </AppText>
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.footer}>
            <Button label={saving ? 'Saving…' : 'Save changes'} icon="check" flex loading={saving} onPress={submit} />
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 12, backgroundColor: colors.slateSoft },
  serverError: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: colors.dangerSoft },
  footer: { flexDirection: 'row', padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
