import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon, IconName } from '@/components/ui/Icon';
import { Avatar, Card, Header, Row, SectionHeader } from '@/components/ui/layout';
import { CustomerDetails, fetchCustomer, InvoiceStatus, rupees, sendInvoice, shortDate } from '@/lib/customers';
import { titleCase } from '@/lib/leads';
import { ColorName, colors } from '@/theme';

const INVOICE_TONE: Record<InvoiceStatus, [ColorName, ColorName]> = {
  PAID: ['success', 'successSoft'],
  PARTIAL: ['warning', 'warningSoft'],
  PENDING: ['primary', 'primarySoft'],
  OVERDUE: ['danger', 'dangerSoft'],
  CANCELLED: ['slate', 'slateSoft'],
};

const SERVICE_TONE: Record<string, [ColorName, ColorName]> = {
  ACTIVE: ['success', 'successSoft'],
  EXPIRED: ['danger', 'dangerSoft'],
  CANCELLED: ['slate', 'slateSoft'],
};

function Pill({ label, tone }: { label: string; tone: [ColorName, ColorName] }) {
  return (
    <View style={[styles.chip, { backgroundColor: colors[tone[1]] }]}>
      <AppText variant="caption" weight="600" color={tone[0]}>
        {label}
      </AppText>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: IconName; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <Row style={styles.infoRow}>
      <Icon name={icon} size={18} color="textSubtle" />
      <AppText variant="label" color="textMuted" weight="400" style={{ width: 80 }}>
        {label}
      </AppText>
      <AppText weight="500" style={{ flex: 1, fontSize: 14, textAlign: 'right' }}>
        {value}
      </AppText>
    </Row>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: ColorName }) {
  return (
    <Card style={{ flex: 1, gap: 2 }}>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <AppText variant="section" color={tone}>
        {value}
      </AppText>
    </Card>
  );
}

export default function CustomerDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<CustomerDetails | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchCustomer(id));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    // Wrapped so state is only set after the await.
    (async () => {
      await load();
    })();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Invoice actions: `busy` is "<invoiceId>:<action>" while one runs; `notice` reports the result.
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const act = async (invoiceId: string, action: 'view' | 'whatsapp' | 'share') => {
    setBusy(`${invoiceId}:${action}`);
    setNotice(null);
    try {
      if (action === 'whatsapp') {
        await sendInvoice(invoiceId, 'WHATSAPP');
        setNotice({ text: 'Invoice link sent to the customer on WhatsApp.', ok: true });
      } else {
        const link = await sendInvoice(invoiceId, 'COPY_LINK');
        if (action === 'view') await Linking.openURL(link);
        else await Share.share({ message: link });
      }
    } catch (e) {
      setNotice({ text: (e as Error).message, ok: false });
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Header title="Customer" back />
        <View style={styles.center}>
          {error ? (
            <>
              <AppText color="danger" align="center">
                {error}
              </AppText>
              <Button label="Try again" variant="outline" small onPress={load} />
            </>
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const { customer, services, invoices } = data;
  const name = customer.businessName || customer.contactName;
  const live = invoices.filter((i) => i.status !== 'CANCELLED');
  const paid = live.reduce((sum, i) => sum + (i.paidAmount ?? 0), 0);
  const due = live.reduce((sum, i) => sum + (i.outstandingAmount ?? 0), 0);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header title="Customer" back />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}>
        <Card style={{ gap: 14 }}>
          <Row>
            <Avatar name={name} size={52} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="heading" numberOfLines={2}>
                {name}
              </AppText>
              <Row gap={8}>
                <Pill label={customer.isActive ? 'Active' : 'Inactive'} tone={customer.isActive ? ['success', 'successSoft'] : ['slate', 'slateSoft']} />
                {customer.category ? <Pill label={customer.category} tone={['slate', 'slateSoft']} /> : null}
              </Row>
            </View>
          </Row>
          {customer.mobile ? (
            <Row gap={10}>
              <Button label="Call" icon="phone" variant="outline" flex onPress={() => Linking.openURL(`tel:${customer.mobile}`)} />
              <Button label="WhatsApp" icon="chat" variant="outline" flex onPress={() => Linking.openURL(`https://wa.me/91${customer.mobile}`)} />
            </Row>
          ) : null}
          {customer.leadId ? (
            <Button label="View lead" icon="target" variant="outline" onPress={() => router.push({ pathname: '/lead/[id]', params: { id: String(customer.leadId) } })} />
          ) : null}
        </Card>

        <Row gap={12}>
          <Stat label="Paid" value={rupees(paid)} tone="success" />
          <Stat label="Due" value={rupees(due)} tone={due > 0 ? 'warning' : 'textMuted'} />
        </Row>

        <Card>
          <InfoRow icon="user" label="Contact" value={customer.contactName} />
          <InfoRow icon="phone" label="Mobile" value={customer.mobile} />
          <InfoRow icon="mail" label="Email" value={customer.email} />
          <InfoRow icon="pin" label="City" value={titleCase(customer.city)} />
          <InfoRow icon="pin" label="Address" value={customer.address} />
          <InfoRow icon="calendar" label="Joined" value={shortDate(customer.joinedDate)} />
        </Card>

        <SectionHeader title={`Services (${services.length})`} />
        {services.length === 0 ? (
          <AppText color="textMuted">No services attached yet.</AppText>
        ) : (
          services.map((s) => {
            const expiry = shortDate(s.expiryDate);
            return (
              <Card key={s._id} style={{ gap: 6 }}>
                <Row>
                  <AppText variant="section" style={{ flex: 1 }} numberOfLines={2}>
                    {s.serviceNameSnapshot}
                  </AppText>
                  <Pill label={s.status} tone={SERVICE_TONE[s.status] ?? ['slate', 'slateSoft']} />
                </Row>
                <AppText variant="label" color="textMuted" weight="400">
                  {rupees(s.agreedPrice)}
                  {s.taxType === 'GST_18' ? ' + 18% GST' : ''}
                  {expiry ? ` · Expires ${expiry}` : ''}
                </AppText>
              </Card>
            );
          })
        )}

        <SectionHeader title={`Invoices (${invoices.length})`} />
        {notice ? (
          <AppText variant="label" color={notice.ok ? 'success' : 'danger'}>
            {notice.text}
          </AppText>
        ) : null}
        {invoices.length > 0 ? (
          <AppText variant="caption" color="textSubtle">
            The customer sees a Proforma invoice (number hidden) until it is fully paid, then the Billing invoice.
          </AppText>
        ) : null}
        {invoices.length === 0 ? (
          <AppText color="textMuted">No invoices yet.</AppText>
        ) : (
          invoices.map((inv) => {
            const dueDate = shortDate(inv.dueDate);
            return (
              <Card key={inv._id} style={{ gap: 6 }}>
                <Row>
                  <View style={{ flex: 1 }}>
                    <AppText variant="section" numberOfLines={1}>
                      {inv.invoiceNumber}
                    </AppText>
                    {/* The customer sees a Proforma (number hidden) until it is fully paid. */}
                    <AppText variant="caption" color={inv.status === 'PAID' ? 'success' : 'textSubtle'}>
                      {inv.status === 'PAID' ? 'Final (billing) invoice' : 'Proforma invoice'}
                    </AppText>
                  </View>
                  <Pill label={inv.status} tone={INVOICE_TONE[inv.status] ?? ['slate', 'slateSoft']} />
                </Row>
                {inv.lines?.length || inv.customerServiceId?.serviceNameSnapshot ? (
                  <AppText variant="label" color="textMuted" weight="400" numberOfLines={2}>
                    {inv.lines?.length ? inv.lines.map((l) => l.serviceName).join(', ') : inv.customerServiceId?.serviceNameSnapshot}
                  </AppText>
                ) : null}
                <Row>
                  <AppText variant="label" color="textMuted" weight="400" style={{ flex: 1 }}>
                    Total {rupees(inv.totalAmount)} · Paid {rupees(inv.paidAmount)}
                  </AppText>
                  {inv.outstandingAmount > 0 ? (
                    <AppText variant="label" weight="600" color="warning">
                      Due {rupees(inv.outstandingAmount)}
                    </AppText>
                  ) : null}
                </Row>
                {dueDate ? (
                  <AppText variant="caption" color="textSubtle">
                    Due date {dueDate}
                  </AppText>
                ) : null}
                {inv.status !== 'CANCELLED' ? (
                  <Row gap={8} style={{ marginTop: 4 }}>
                    <Button label="View" icon="eye" variant="outline" small flex loading={busy === `${inv._id}:view`} onPress={() => act(inv._id, 'view')} />
                    <Button label="WhatsApp" icon="chat" variant="outline" small flex loading={busy === `${inv._id}:whatsapp`} disabled={!customer.mobile} onPress={() => act(inv._id, 'whatsapp')} />
                    <Button label="Share" icon="send" small flex loading={busy === `${inv._id}:share`} onPress={() => act(inv._id, 'share')} />
                  </Row>
                ) : null}
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 4, gap: 14, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  infoRow: { paddingVertical: 8 },
});
