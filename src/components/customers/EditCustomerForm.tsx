import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/layout';
import { CustomerDetails, updateCustomer } from '@/lib/customers';
import { DEFAULT_CALLING_CODE, isValidNumber } from '@/lib/phone';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Edit customer: contact name, business name, mobile and email (the same four fields as the web). */
export function EditCustomerForm({ customer, onSaved }: { customer: CustomerDetails['customer']; onSaved: () => void | Promise<void> }) {
  const [form, setForm] = useState({
    contactName: customer.contactName ?? '',
    businessName: customer.businessName ?? '',
    mobile: customer.mobile ?? '',
    email: customer.email ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: k === 'mobile' ? v.replace(/\D/g, '') : v }));

  // Only a changed number is checked, so an old record with an odd number can still have its name fixed.
  const code = customer.countryCode || DEFAULT_CALLING_CODE;
  const mobileChanged = form.mobile !== (customer.mobile ?? '');
  const errors = {
    contactName: form.contactName.trim() ? '' : 'Enter the contact name',
    businessName: form.businessName.trim() ? '' : 'Enter the business name',
    mobile: mobileChanged && form.mobile && !isValidNumber(code, form.mobile) ? (code === DEFAULT_CALLING_CODE ? 'Mobile must be exactly 10 digits' : `Enter a valid mobile number for +${code}`) : '',
    email: form.email.trim() && !EMAIL_RX.test(form.email.trim()) ? 'Enter a valid email' : '',
  };
  const invalid = Object.values(errors).some(Boolean);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await updateCustomer(customer._id, form);
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Field label="Contact name" required icon="user" value={form.contactName} onChangeText={set('contactName')} autoCapitalize="words" error={errors.contactName} />
      <Field label="Business name" required icon="briefcase" value={form.businessName} onChangeText={set('businessName')} autoCapitalize="words" error={errors.businessName} />
      <Field label="Mobile" icon="phone" keyboardType="phone-pad" value={form.mobile} onChangeText={set('mobile')} error={errors.mobile} />
      <Field label="Email" icon="mail" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={set('email')} error={errors.email} />
      {error ? (
        <AppText variant="label" color="danger">
          {error}
        </AppText>
      ) : null}
      <Button label={saving ? 'Getting location…' : 'Save changes'} loading={saving} disabled={invalid} onPress={save} />
    </View>
  );
}
