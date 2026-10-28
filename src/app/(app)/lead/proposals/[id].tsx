import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { timeAgo } from '@/components/leads/meta';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Card, Field, Header, Row } from '@/components/ui/layout';
import { Sheet } from '@/components/ui/Sheet';
import { EmailDocumentForm } from '@/components/EmailDocumentForm';
import { fetchLead, Lead } from '@/lib/leads';
import {
  fetchProposals,
  fetchServices,
  generateProposal,
  htmlToText,
  OTHER_SERVICE,
  Proposal,
  PROPOSAL_STATUS_TONE as STATUS_TONE,
  ProposalSection,
  proposalUrl,
  saveProposal,
  ServiceOption,
} from '@/lib/proposals';
import { ColorName, colors } from '@/theme';

const dateText = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
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

function ProposalCard({ p, now, onError, onEmail }: { p: Proposal; now: number; onError: (m: string) => void; onEmail: () => void }) {
  const preview = proposalUrl(p.publicToken, true);
  const link = proposalUrl(p.publicToken);
  const created = dateText(p.createdAt);
  const valid = dateText(p.validUntil);
  const expired = !!p.validUntil && new Date(p.validUntil).getTime() < now;

  return (
    <Card style={{ gap: 10 }}>
      <Row>
        <View style={{ flex: 1 }}>
          <AppText variant="section">
            Proposal #{p._id.slice(-6).toUpperCase()}
            {p.version && p.version > 1 ? ` · v${p.version}` : ''}
          </AppText>
          {p.coverType ? (
            <AppText variant="label" color="textMuted" weight="400" numberOfLines={2}>
              {p.coverType}
            </AppText>
          ) : null}
        </View>
        <Pill label={p.status} tone={STATUS_TONE[p.status] ?? ['slate', 'slateSoft']} />
      </Row>
      <Row gap={14}>
        <Row gap={5}>
          <Icon name="eye" size={14} color="textSubtle" />
          <AppText variant="caption" color="textMuted">
            {p.viewCount} {p.viewCount === 1 ? 'view' : 'views'}
            {p.lastViewedAt ? ` · ${timeAgo(p.lastViewedAt)}` : ''}
          </AppText>
        </Row>
        {created ? (
          <AppText variant="caption" color="textSubtle">
            Created {created}
          </AppText>
        ) : null}
      </Row>
      {valid ? (
        <AppText variant="caption" color={expired ? 'danger' : 'textSubtle'}>
          {expired ? 'Expired' : 'Valid until'} {valid}
        </AppText>
      ) : null}
      {link ? (
        <Row gap={10}>
          <Button label="Preview" icon="eye" variant="outline" small flex onPress={() => Linking.openURL(preview ?? link)} />
          <Button
            label="Share link"
            icon="send"
            variant="soft"
            small
            flex
            onPress={() => Share.share({ message: link }).catch((e: Error) => onError(e.message))}
          />
        </Row>
      ) : null}
      {link ? <Button label="Email proposal" icon="mail" variant="outline" small onPress={onEmail} /> : null}
    </Card>
  );
}

export default function LeadProposals() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lead, setLead] = useState<Lead | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState('');
  const [now, setNow] = useState(() => new Date().getTime());

  // New-proposal sheet: step 1 picks services, step 2 previews the generated text before saving.
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [remarks, setRemarks] = useState('');
  const [sections, setSections] = useState<ProposalSection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState('');
  // "Email this proposal" sheet: which proposal it is for (null = closed).
  const [emailProposalId, setEmailProposalId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, p, s] = await Promise.all([fetchLead(id), fetchProposals(id), fetchServices()]);
      setLead(l.lead);
      setProposals(p);
      setServices((s ?? []).filter((x) => x.isActive !== false));
      setNow(new Date().getTime());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const openSheet = () => {
    setPicked([]);
    setRemarks('');
    setSections(null);
    setSheetError('');
    setOpen(true);
  };

  const toggle = (sid: string) => setPicked((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));

  const usesAi = picked.includes(OTHER_SERVICE);
  const canGenerate = picked.length > 0 && (!usesAi || remarks.trim().length > 0);

  const generate = async () => {
    if (!lead) return;
    setBusy(true);
    setSheetError('');
    try {
      setSections(
        await generateProposal({
          serviceIds: picked,
          category: lead.category ?? '',
          businessName: lead.companyName || lead.contactName || '',
          location: lead.city ?? '',
          remarks: usesAi ? remarks.trim() : '',
        }),
      );
    } catch (e) {
      setSheetError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!sections) return;
    setBusy(true);
    setSheetError('');
    try {
      await saveProposal(id, picked, sections);
      setOpen(false);
      flash('Proposal saved');
      await load();
    } catch (e) {
      setSheetError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!lead || !proposals) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Header title="Proposals" back />
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

  const name = lead.companyName || lead.contactName || 'Lead';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header title="Proposals" subtitle={name} back />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }>
        <Button label="New proposal" icon="plus" onPress={openSheet} />

        {proposals.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="file" size={32} color="textSubtle" />
            <AppText color="textMuted" align="center">
              No proposals yet. Create one from your services.
            </AppText>
          </View>
        ) : (
          proposals.map((p) => <ProposalCard key={p._id} p={p} now={now} onError={flash} onEmail={() => setEmailProposalId(p._id)} />)
        )}
      </ScrollView>

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Icon name="check" size={16} color="surface" />
          <AppText color="surface" weight="500">
            {toast}
          </AppText>
        </View>
      ) : null}

      <Sheet visible={!!emailProposalId} onClose={() => setEmailProposalId(null)} title="Email this proposal">
        {emailProposalId ? (
          <EmailDocumentForm
            key={emailProposalId}
            kind="proposal"
            id={emailProposalId}
            defaultTo={lead?.email ?? ''}
            onSent={(text) => {
              setEmailProposalId(null);
              flash(text);
            }}
          />
        ) : null}
      </Sheet>

      <Sheet visible={open} onClose={() => setOpen(false)} title={sections ? 'Preview proposal' : 'New proposal'} fullHeight>
        {sections ? (
          <>
            <ScrollView style={styles.preview} showsVerticalScrollIndicator={false}>
              <AppText style={{ fontSize: 14, lineHeight: 21 }}>{htmlToText(sections.map((s) => s.html).join('\n\n'))}</AppText>
            </ScrollView>
            {sheetError ? (
              <AppText variant="label" color="danger">
                {sheetError}
              </AppText>
            ) : null}
            <Row gap={10}>
              <Button label="Back" variant="outline" flex disabled={busy} onPress={() => setSections(null)} />
              <Button label={busy ? 'Saving…' : 'Save proposal'} flex loading={busy} onPress={save} />
            </Row>
          </>
        ) : (
          <>
            <AppText variant="label" color="textMuted" weight="400">
              Pick the services to include. Choose Other to have AI write a custom proposal from your remarks.
            </AppText>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 8 }}>
                {[...services, { _id: OTHER_SERVICE, name: 'Other (write with AI)' } as ServiceOption].map((s) => {
                  const on = picked.includes(s._id);
                  return (
                    <Pressable key={s._id} onPress={() => toggle(s._id)} style={[styles.option, on && styles.optionOn]}>
                      <View style={[styles.box, on && styles.boxOn]}>{on ? <Icon name="check" size={14} color="surface" /> : null}</View>
                      <AppText weight="500" style={{ flex: 1 }}>
                        {s.name}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            {usesAi ? (
              <Field label="Remarks for AI" placeholder="What does this business need?" multiline value={remarks} onChangeText={setRemarks} />
            ) : null}
            {sheetError ? (
              <AppText variant="label" color="danger">
                {sheetError}
              </AppText>
            ) : null}
            <Button label={busy ? 'Generating…' : 'Generate proposal'} loading={busy} disabled={!canGenerate} onPress={generate} />
          </>
        )}
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 4, gap: 14, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  empty: { alignItems: 'center', gap: 10, paddingTop: 40 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  preview: { maxHeight: 420, padding: 12, borderRadius: 12, backgroundColor: colors.bg },
  toast: { position: 'absolute', bottom: 28, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.text, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
});
