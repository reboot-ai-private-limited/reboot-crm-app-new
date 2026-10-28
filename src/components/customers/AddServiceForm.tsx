import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Icon } from '@/components/ui/Icon';
import { Field, Row, Segmented } from '@/components/ui/layout';
import { SelectField } from '@/components/ui/SelectField';
import { attachService, rupees } from '@/lib/customers';
import { DealLineForm, emptyLine, lineError, lineTotals, TAX_LABEL, TaxType } from '@/lib/deal';
import { fetchServices, ServiceOption } from '@/lib/proposals';
import { colors, radius } from '@/theme';

const TAX_ITEMS = [TAX_LABEL.NONE, TAX_LABEL.GST_18];
const taxFromLabel = (l: string): TaxType => (l === TAX_LABEL.GST_18 ? 'GST_18' : 'NONE');
const digits = (t: string) => t.replace(/[^\d.]/g, '');
const tomorrow = () => new Date(new Date().setHours(0, 0, 0, 0) + 86_400_000);

/**
 * Add a service to an existing customer (same as the web "Attach New Service"): pick from Services Master (price and tax
 * are pre-filled and stay editable), a discount, and an optional expiry date. The backend then creates its invoice.
 */
export function AddServiceForm({ customerId, onSaved }: { customerId: string; onSaved: () => void | Promise<void> }) {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loadError, setLoadError] = useState('');
  const [line, setLine] = useState<DealLineForm>(emptyLine);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let stale = false;
    fetchServices()
      .then((s) => !stale && setServices(s))
      .catch((e: Error) => !stale && setLoadError(e.message));
    return () => {
      stale = true;
    };
  }, []);

  const patch = (p: Partial<DealLineForm>) => setLine((l) => ({ ...l, ...p }));
  const pick = (name: string) => {
    const s = services.find((x) => x.name === name);
    if (s) patch({ serviceId: s._id, serviceName: s.name, amount: s.price != null ? String(s.price) : '', taxType: s.defaultTaxType ?? 'NONE' });
  };

  const problem = lineError(line);
  const t = lineTotals(line);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await attachService(customerId, { serviceId: line.serviceId, agreedPrice: t.amount, discount: t.discount, taxType: line.taxType, expiryDate: line.expiry });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {loadError ? (
          <AppText variant="label" color="danger">
            Couldn&apos;t load services: {loadError}
          </AppText>
        ) : null}
        <SelectField label="Service" required icon="briefcase" value={line.serviceName} placeholder={services.length ? 'Choose a service' : 'Loading…'} options={services.map((s) => s.name)} onChange={pick} />
        <Row gap={10}>
          <Field label="Amount (₹)" required flex keyboardType="number-pad" placeholder="0" value={line.amount} onChangeText={(v) => patch({ amount: digits(v) })} />
          <Field label="Discount (₹)" flex keyboardType="number-pad" placeholder="0" value={line.discount} onChangeText={(v) => patch({ discount: digits(v) })} />
        </Row>
        <Segmented items={TAX_ITEMS} value={TAX_LABEL[line.taxType]} onChange={(v) => patch({ taxType: taxFromLabel(v) })} />
        <Pressable onPress={() => patch({ expiry: line.expiry ? null : new Date(new Date().setFullYear(new Date().getFullYear() + 1)) })} style={styles.toggle}>
          <Icon name={line.expiry ? 'check' : 'plus'} size={14} color="primary" />
          <AppText variant="label" color="primary">
            {line.expiry ? 'Has expiry date (renewal)' : 'Add expiry date (optional)'}
          </AppText>
        </Pressable>
        {line.expiry ? <DateTimeField dateOnly label="Expires on" value={line.expiry} minimumDate={tomorrow()} onChange={(d) => patch({ expiry: d })} /> : null}
        <View style={styles.total}>
          <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
            Final {rupees(t.finalAmount)}
            {t.taxAmount > 0 ? ` + GST ${rupees(t.taxAmount)}` : ''}
            {line.expiry ? '' : ' · one-time'}
          </AppText>
          <AppText weight="700">{rupees(t.lineTotal)}</AppText>
        </View>
        <AppText variant="caption" color="textSubtle">
          An invoice is created for this service.
        </AppText>
      </ScrollView>
      {error ? (
        <AppText variant="label" color="danger">
          {error}
        </AppText>
      ) : null}
      <Button label={saving ? 'Getting location…' : 'Add service'} loading={saving} disabled={!!problem} onPress={save} />
    </>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  total: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.primarySoft },
});
