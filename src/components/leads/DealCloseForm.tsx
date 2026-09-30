import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Icon } from '@/components/ui/Icon';
import { Field, FilterChips, Row, Segmented } from '@/components/ui/layout';
import { SelectField } from '@/components/ui/SelectField';
import { rupees } from '@/lib/customers';
import { DealForm, DealLineForm, dealTotal, emptyLine, lineTotals, PAYMENT_METHODS, TAX_LABEL, TaxType } from '@/lib/deal';
import { fetchServices, ServiceOption } from '@/lib/proposals';
import { colors, radius } from '@/theme';

const TAX_ITEMS = [TAX_LABEL.NONE, TAX_LABEL.GST_18];
const taxFromLabel = (l: string): TaxType => (l === TAX_LABEL.GST_18 ? 'GST_18' : 'NONE');
const digits = (t: string) => t.replace(/[^\d.]/g, '');
const tomorrow = () => new Date(new Date().setHours(0, 0, 0, 0) + 86_400_000);

/**
 * Deal close (backend/docs/02-BUSINESS-RULES.md §8.1): one or more services from Services Master
 * (amount, discount, tax, optional expiry), due date, optional advance and notes.
 */
export function DealCloseForm({ value, onChange }: { value: DealForm; onChange: (f: DealForm) => void }) {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let stale = false;
    fetchServices()
      .then((s) => !stale && setServices(s))
      .catch((e: Error) => !stale && setLoadError(e.message));
    return () => {
      stale = true;
    };
  }, []);

  const setLine = (key: string, patch: Partial<DealLineForm>) => onChange({ ...value, lines: value.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  const setAdvance = (patch: Partial<DealForm['advance']>) => onChange({ ...value, advance: { ...value.advance, ...patch } });

  // Picking a service pre-fills its price and tax from Services Master; both stay editable.
  const pick = (key: string, name: string) => {
    const s = services.find((x) => x.name === name);
    if (s) setLine(key, { serviceId: s._id, serviceName: s.name, amount: s.price != null ? String(s.price) : '', taxType: s.defaultTaxType ?? 'NONE' });
  };

  const total = dealTotal(value.lines);
  const advance = value.advance.on ? Number(value.advance.amount) || 0 : 0;
  const methodLabel = PAYMENT_METHODS.find((m) => m.value === value.advance.method)?.label ?? 'UPI';

  return (
    <View style={{ gap: 14 }}>
      {loadError ? (
        <AppText variant="label" color="danger">
          Couldn&apos;t load services: {loadError}
        </AppText>
      ) : null}

      {value.lines.map((l, i) => {
        const t = lineTotals(l);
        return (
          <View key={l.key} style={styles.line}>
            <Row>
              <View style={{ flex: 1 }}>
                <SelectField
                  label={value.lines.length > 1 ? `Service ${i + 1}` : 'Service'}
                  required
                  icon="briefcase"
                  value={l.serviceName}
                  placeholder={services.length ? 'Choose a service' : 'Loading…'}
                  options={services.map((s) => s.name)}
                  onChange={(n) => pick(l.key, n)}
                />
              </View>
              {value.lines.length > 1 ? (
                <Pressable onPress={() => onChange({ ...value, lines: value.lines.filter((x) => x.key !== l.key) })} hitSlop={8} style={styles.remove}>
                  <Icon name="x" size={16} color="danger" />
                </Pressable>
              ) : null}
            </Row>
            <Row gap={10}>
              <Field label="Amount (₹)" required flex keyboardType="number-pad" placeholder="0" value={l.amount} onChangeText={(v) => setLine(l.key, { amount: digits(v) })} />
              <Field label="Discount (₹)" flex keyboardType="number-pad" placeholder="0" value={l.discount} onChangeText={(v) => setLine(l.key, { discount: digits(v) })} />
            </Row>
            <Segmented items={TAX_ITEMS} value={TAX_LABEL[l.taxType]} onChange={(v) => setLine(l.key, { taxType: taxFromLabel(v) })} />
            <Pressable onPress={() => setLine(l.key, { expiry: l.expiry ? null : new Date(new Date().setFullYear(new Date().getFullYear() + 1)) })} style={styles.toggle}>
              <Icon name={l.expiry ? 'check' : 'plus'} size={14} color="primary" />
              <AppText variant="label" color="primary">
                {l.expiry ? 'Has expiry date (renewal)' : 'Add expiry date (optional)'}
              </AppText>
            </Pressable>
            {l.expiry ? <DateTimeField dateOnly label="Expires on" value={l.expiry} minimumDate={tomorrow()} onChange={(d) => setLine(l.key, { expiry: d })} /> : null}
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText variant="caption" color="textMuted">
                Final {rupees(t.finalAmount)}
                {t.taxAmount > 0 ? ` + GST ${rupees(t.taxAmount)}` : ''}
                {l.expiry ? '' : ' · one-time'}
              </AppText>
              <AppText weight="700">{rupees(t.lineTotal)}</AppText>
            </Row>
          </View>
        );
      })}

      <Pressable onPress={() => onChange({ ...value, lines: [...value.lines, emptyLine()] })} style={styles.add}>
        <Icon name="plus" size={16} color="primary" />
        <AppText variant="label" weight="600" color="primary">
          Add another service
        </AppText>
      </Pressable>

      <DateTimeField dateOnly label="Payment due by" value={value.dueDate} minimumDate={new Date(new Date().setHours(0, 0, 0, 0))} onChange={(d) => onChange({ ...value, dueDate: d })} />

      <View style={styles.total}>
        <AppText variant="label" color="textMuted">
          Deal total
        </AppText>
        <AppText variant="heading">{rupees(total)}</AppText>
      </View>

      <Pressable onPress={() => setAdvance({ on: !value.advance.on })} style={styles.check}>
        <View style={[styles.box, value.advance.on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
          {value.advance.on ? <Icon name="check" size={14} color="surface" /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <AppText weight="600">Advance received</AppText>
          <AppText variant="caption" color="textMuted">
            Paid before closing; saved as the first payment on the invoice
          </AppText>
        </View>
      </Pressable>
      {value.advance.on ? (
        <View style={{ gap: 12 }}>
          <Field label="Advance amount (₹)" required keyboardType="number-pad" placeholder="0" value={value.advance.amount} onChangeText={(v) => setAdvance({ amount: digits(v) })} />
          <FilterChips items={PAYMENT_METHODS.map((m) => m.label)} value={methodLabel} onChange={(l) => setAdvance({ method: PAYMENT_METHODS.find((m) => m.label === l)?.value ?? 'UPI' })} />
          <DateTimeField dateOnly label="Received on" value={value.advance.date} maximumDate={new Date()} onChange={(d) => setAdvance({ date: d })} />
          <Field label="Reference (optional)" placeholder="UTR / cheque no." value={value.advance.referenceId} onChangeText={(v) => setAdvance({ referenceId: v })} />
          <AppText variant="caption" color="textMuted">
            Balance after advance: {rupees(Math.max(0, total - advance))}
          </AppText>
        </View>
      ) : null}

      <Field label="Notes (optional)" multiline placeholder="Shown on the invoice" value={value.notes} onChangeText={(v) => onChange({ ...value, notes: v })} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  remove: { padding: 8, marginTop: 22, borderRadius: 10, backgroundColor: colors.dangerSoft },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
});
