import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Field, Header } from '@/components/ui/layout';
import { SelectField } from '@/components/ui/SelectField';
import { CATEGORIES } from '@/constants/categories';
import { CITIES } from '@/constants/cities';
import { ApiError } from '@/lib/api';
import { LeadInput, statusLabel } from '@/lib/leads';
import { isValidWebsite } from '@/lib/website';
import { codeForLabel, COUNTRY_LABELS, DEFAULT_CALLING_CODE, isValidNumber, labelForCode } from '@/lib/phone';
import { colors } from '@/theme';

type Errors = Partial<Record<keyof LeadInput, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same rules as backend createLeadSchema (backend/src/modules/lead/interface/lead.validator.ts).
function validate(v: LeadInput): Errors {
  const e: Errors = {};
  if (v.companyName.trim().length < 2) e.companyName = 'Enter at least 2 characters';
  if (v.contactName.trim().length < 2) e.contactName = 'Enter at least 2 characters';
  const mobile = (v.mobile ?? '').trim();
  const email = (v.email ?? '').trim();
  const code = v.countryCode || DEFAULT_CALLING_CODE;
  if (mobile && !isValidNumber(code, mobile)) e.mobile = code === DEFAULT_CALLING_CODE ? 'Mobile must be exactly 10 digits' : `Enter a valid mobile number for +${code}`;
  if (email && !EMAIL.test(email)) e.email = 'Enter a valid email';
  if (!mobile && !email) e.mobile = 'Enter a mobile number or an email';
  if (!v.city) e.city = 'Select a city';
  if (!v.category) e.category = 'Select a category';
  if (!isValidWebsite(v.website ?? '')) e.website = 'Enter a valid website, e.g. example.com';
  return e;
}

/** Shared by Add lead and Edit lead. `onSubmit` should throw an Error with a readable message on failure. */
export function LeadForm({
  title,
  subtitle,
  initial,
  submitLabel,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  initial: LeadInput;
  submitLabel: string;
  onSubmit: (v: LeadInput) => Promise<void>;
}) {
  const router = useRouter();
  const [v, setV] = useState<LeadInput>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  // 409 duplicate → the existing lead, so the user can open it instead.
  const [duplicate, setDuplicate] = useState<{ _id: string; companyName?: string; contactName?: string; status?: string; assignedTo?: { fullName?: string } | null } | null>(null);

  const set = (k: keyof LeadInput) => (val: string) => {
    const next = { ...v, [k]: k === 'mobile' ? val.replace(/\D/g, '') : val };
    setV(next);
    if (touched) setErrors(validate(next));
  };

  const submit = async () => {
    setTouched(true);
    const e = validate(v);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    setServerError('');
    setDuplicate(null);
    try {
      await onSubmit(v);
    } catch (err) {
      const existing = err instanceof ApiError && err.status === 409 ? (err.data as { existingLead?: typeof duplicate } | undefined)?.existingLead : undefined;
      if (existing) setDuplicate(existing);
      setServerError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/leads'));

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Header title={title} subtitle={subtitle} back onBack={goBack} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppText variant="label" color="textSubtle" weight="600" style={styles.group}>
            BUSINESS
          </AppText>
          <Field label="Company name" required placeholder="e.g. Sharma Traders" value={v.companyName} onChangeText={set('companyName')} error={errors.companyName} autoCapitalize="words" />
          <Field label="Contact person" required placeholder="Full name" icon="user" value={v.contactName} onChangeText={set('contactName')} error={errors.contactName} autoCapitalize="words" />

          <AppText variant="label" color="textSubtle" weight="600" style={styles.group}>
            CONTACT
          </AppText>
          <SelectField label="Country code" icon="globe" value={labelForCode(v.countryCode)} options={COUNTRY_LABELS} onChange={(label) => set('countryCode')(codeForLabel(label))} />
          <Field
            label="Mobile"
            icon="phone"
            placeholder={(v.countryCode || DEFAULT_CALLING_CODE) === DEFAULT_CALLING_CODE ? '10-digit number' : 'Mobile number'}
            value={v.mobile ?? ''}
            onChangeText={set('mobile')}
            keyboardType="phone-pad"
            maxLength={15}
            error={errors.mobile}
          />
          <Field label="Email" icon="mail" placeholder="name@company.com" value={v.email ?? ''} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
          <AppText variant="caption" color="textSubtle">
            Mobile or email is required. Duplicates are checked when you save.
          </AppText>

          <AppText variant="label" color="textSubtle" weight="600" style={styles.group}>
            LOCATION & TYPE
          </AppText>
          <SelectField label="City" required icon="pin" value={v.city} options={CITIES} onChange={set('city')} error={errors.city} />
          <SelectField label="Category" required icon="briefcase" value={v.category} options={CATEGORIES} onChange={set('category')} error={errors.category} />
          <Field label="Address" placeholder="Street, area (optional)" value={v.address ?? ''} onChangeText={set('address')} />
          <Field label="Website" icon="globe" placeholder="example.com (optional)" value={v.website ?? ''} onChangeText={set('website')} keyboardType="default" autoCapitalize="none" error={errors.website} />

          {duplicate ? (
            <View style={styles.duplicate}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText weight="600" color="warning">
                  This lead already exists
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {[duplicate.companyName || duplicate.contactName, statusLabel(duplicate.status), duplicate.assignedTo?.fullName ? `with ${duplicate.assignedTo.fullName}` : 'in the lead pool'].filter(Boolean).join(' · ')}
                </AppText>
              </View>
              <Button label="Open lead" variant="outline" small onPress={() => router.replace({ pathname: '/lead/[id]', params: { id: duplicate._id } })} />
            </View>
          ) : serverError ? (
            <View style={styles.serverError}>
              <Icon name="alert" size={16} color="danger" />
              <AppText variant="label" color="danger" style={{ flex: 1 }}>
                {serverError}
              </AppText>
            </View>
          ) : null}
        </ScrollView>
        <View style={styles.footer}>
          <Button label={saving ? 'Saving…' : submitLabel} icon="check" flex loading={saving} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 4, gap: 14 },
  group: { marginTop: 6, letterSpacing: 0.6 },
  footer: { flexDirection: 'row', padding: 20, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  duplicate: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: colors.warningSoft },
  serverError: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: colors.dangerSoft },
});
