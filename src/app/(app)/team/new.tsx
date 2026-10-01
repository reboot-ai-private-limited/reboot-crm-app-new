import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Field, Header, Segmented } from '@/components/ui/layout';
import { createEmployee, EmployeeRole, ROLE_LABEL } from '@/lib/reporting';
import { colors } from '@/theme';

const ROLES: EmployeeRole[] = ['BusinessAdvisor', 'FieldSales', 'Admin'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = Partial<Record<'fullName' | 'mobile' | 'email', string>>;

// Same rules as the backend createEmployeeSchema (and the web Add Employee form).
function validate(v: { fullName: string; mobile: string; email: string }): Errors {
  const e: Errors = {};
  if (v.fullName.trim().length < 2) e.fullName = 'Enter at least 2 characters';
  if (!/^\d{10}$/.test(v.mobile)) e.mobile = 'Mobile must be exactly 10 digits';
  if (!EMAIL.test(v.email.trim())) e.email = 'Enter a valid email';
  return e;
}

// Admin: POST /employees.
export default function AddEmployee() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<EmployeeRole>('BusinessAdvisor');
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');

  const check = (v: { fullName: string; mobile: string; email: string }) => {
    if (touched) setErrors(validate(v));
  };

  const submit = async () => {
    setTouched(true);
    const values = { fullName, mobile, email };
    const e = validate(values);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    setServerError('');
    try {
      await createEmployee({ fullName: fullName.trim(), mobile, email: email.trim(), role });
      router.back(); // the Team tab reloads when it comes back into view
    } catch (err) {
      setServerError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Header title="Add employee" subtitle="They sign in with this mobile number" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field
            label="Full name"
            required
            icon="user"
            placeholder="e.g. Rahul Sharma"
            value={fullName}
            onChangeText={(t) => {
              setFullName(t);
              check({ fullName: t, mobile, email });
            }}
            error={errors.fullName}
            autoCapitalize="words"
          />
          <Field
            label="Mobile"
            required
            icon="phone"
            placeholder="10-digit number"
            value={mobile}
            onChangeText={(t) => {
              const m = t.replace(/\D/g, '');
              setMobile(m);
              check({ fullName, mobile: m, email });
            }}
            keyboardType="phone-pad"
            maxLength={10}
            error={errors.mobile}
          />
          <Field
            label="Email"
            required
            icon="mail"
            placeholder="name@company.com"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              check({ fullName, mobile, email: t });
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
          />

          <View style={{ gap: 6 }}>
            <AppText variant="label" color="textMuted">
              Role *
            </AppText>
            <Segmented items={ROLES.map((r) => ROLE_LABEL[r])} value={ROLE_LABEL[role]} onChange={(l) => setRole(ROLES.find((r) => ROLE_LABEL[r] === l) ?? 'BusinessAdvisor')} />
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
          <Button label={saving ? 'Saving…' : 'Add employee'} icon="check" flex loading={saving} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 4, gap: 14 },
  footer: { flexDirection: 'row', padding: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  serverError: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: colors.dangerSoft },
});
