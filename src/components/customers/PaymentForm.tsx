import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Field, FilterChips, Row } from '@/components/ui/layout';
import { CustomerDetails, recordPayment, rupees } from '@/lib/customers';
import { PAYMENT_METHODS, PaymentMethod } from '@/lib/deal';
import { colors, radius } from '@/theme';

type Invoice = CustomerDetails['invoices'][number];

/** Record a manual payment against an invoice (no gateway). The amount can be at most what is still due. */
export function PaymentForm({ invoice, onSaved }: { invoice: Invoice; onSaved: () => void | Promise<void> }) {
  const [amount, setAmount] = useState(String(invoice.outstandingAmount));
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const value = Number(amount) || 0;
  const tooMuch = value > invoice.outstandingAmount;
  const methodLabel = PAYMENT_METHODS.find((m) => m.value === method)?.label ?? 'Bank';

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await recordPayment(invoice._id, { amount: value, method, referenceId: reference });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Row style={styles.due}>
        <AppText variant="label" color="textMuted" style={{ flex: 1 }}>
          {invoice.invoiceNumber} · still due
        </AppText>
        <AppText weight="700" color="danger">
          {rupees(invoice.outstandingAmount)}
        </AppText>
      </Row>
      <Field
        label="Amount (₹)"
        required
        keyboardType="number-pad"
        value={amount}
        onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))}
        error={tooMuch ? `Cannot be more than ${rupees(invoice.outstandingAmount)}` : undefined}
      />
      <View style={{ gap: 6 }}>
        <AppText variant="label" color="textMuted">
          Payment method
        </AppText>
        <FilterChips items={PAYMENT_METHODS.map((m) => m.label)} value={methodLabel} onChange={(l) => setMethod(PAYMENT_METHODS.find((m) => m.label === l)?.value ?? 'BANK_TRANSFER')} />
      </View>
      <Field label="Reference (optional)" placeholder="UTR / cheque no." value={reference} onChangeText={setReference} />
      {error ? (
        <AppText variant="label" color="danger">
          {error}
        </AppText>
      ) : null}
      <Button label={saving ? 'Getting location…' : 'Confirm payment'} loading={saving} disabled={!(value > 0) || tooMuch} onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  due: { padding: 14, borderRadius: radius.md, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
});
