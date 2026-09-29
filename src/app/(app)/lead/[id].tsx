import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { eventDetail, eventMeta, STATUS_TONE, timeAgo } from '@/components/leads/meta';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DateTimeField, formatDateTime } from '@/components/ui/DateTimeField';
import { Icon, IconName } from '@/components/ui/Icon';
import { Avatar, Card, Field, Header, IconButton, Row } from '@/components/ui/layout';
import { Sheet } from '@/components/ui/Sheet';
import { Activity, addNote, fetchLead, Lead, markInvalid, markLost, scheduleFollowUp, STATUS_LABEL, titleCase } from '@/lib/leads';
import { colors } from '@/theme';

type SheetKind = 'note' | 'followup' | 'lost' | 'invalid' | null;

function defaultFollowUp() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(11, 0, 0, 0);
  return d;
}

function QuickAction({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={[styles.quick, disabled && { opacity: 0.4 }]}>
      <View style={styles.quickIcon}>
        <Icon name={icon} size={20} color="primary" />
      </View>
      <AppText variant="caption" weight="500">
        {label}
      </AppText>
    </Pressable>
  );
}

function InfoRow({ icon, label, value }: { icon: IconName; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <Row style={styles.infoRow}>
      <Icon name={icon} size={18} color="textSubtle" />
      <AppText variant="label" color="textMuted" weight="400" style={{ width: 92 }}>
        {label}
      </AppText>
      <AppText weight="500" style={{ flex: 1, fontSize: 14, textAlign: 'right' }}>
        {value}
      </AppText>
    </Row>
  );
}

export default function LeadDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const loadedOnce = useRef(false);

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [text, setText] = useState('');
  const [date, setDate] = useState(defaultFollowUp);
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [toast, setToast] = useState('');
  // Time reference for 'overdue' / 'in the future' checks; refreshed on load and when a sheet opens.
  const [now, setNow] = useState(() => new Date().getTime());

  const load = useCallback(async () => {
    try {
      const r = await fetchLead(id);
      setLead(r.lead);
      setActivities(r.activities);
      setNow(new Date().getTime());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      loadedOnce.current = true;
      setRefreshing(false);
    }
  }, [id]);

  // Reload whenever the screen comes back into view (e.g. after editing).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openSheet = (k: SheetKind) => {
    setText('');
    setSheetError('');
    setDate(defaultFollowUp());
    setNow(new Date().getTime());
    setSheet(k);
  };

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const submitSheet = async () => {
    if (!lead || !sheet) return;
    setSaving(true);
    setSheetError('');
    try {
      if (sheet === 'note') await addNote(lead._id, text);
      if (sheet === 'followup') await scheduleFollowUp(lead._id, date, text);
      if (sheet === 'lost') await markLost(lead._id, text);
      if (sheet === 'invalid') await markInvalid(lead._id, text);
      const done = { note: 'Note added', followup: 'Follow-up scheduled', lost: 'Lead marked as lost', invalid: 'Lead marked as invalid' }[sheet];
      setSheet(null);
      flash(done);
      await load();
    } catch (e) {
      setSheetError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const sheetValid =
    sheet === 'note' ? text.trim().length > 0 : sheet === 'followup' ? date.getTime() > now : text.trim().length >= 2;

  if (!lead) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <Header title="Lead details" back />
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

  const name = lead.companyName || lead.contactName || 'Unnamed lead';
  const [fg, bg] = STATUS_TONE[lead.status] ?? ['slate', 'slateSoft'];
  const closed = lead.status === 'LOST' || lead.status === 'INVALID_DATA' || lead.status === 'CONVERTED';
  const assignee = typeof lead.assignedTo === 'object' && lead.assignedTo ? lead.assignedTo.fullName : undefined;
  const followUp = lead.nextFollowUpDate ? new Date(lead.nextFollowUpDate) : null;
  const overdue = followUp ? followUp.getTime() < now : false;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header title="Lead details" back right={<IconButton icon="edit" onPress={() => router.push({ pathname: '/lead/edit/[id]', params: { id: lead._id } })} />} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }>
        {/* Summary */}
        <Card style={{ gap: 14 }}>
          <Row>
            <Avatar name={name} size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="section" style={{ fontSize: 19 }}>
                {name}
              </AppText>
              <AppText variant="label" color="textMuted" weight="400">
                {[lead.contactName, titleCase(lead.city)].filter(Boolean).join(' · ')}
              </AppText>
            </View>
          </Row>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            <View style={[styles.chip, { backgroundColor: colors[bg] }]}>
              <AppText variant="caption" weight="600" color={fg}>
                {STATUS_LABEL[lead.status] ?? lead.status}
              </AppText>
            </View>
            {lead.category ? (
              <View style={[styles.chip, { backgroundColor: colors.slateSoft }]}>
                <AppText variant="caption" weight="500" color="slate">
                  {lead.category}
                </AppText>
              </View>
            ) : null}
            {lead.source ? (
              <View style={[styles.chip, { backgroundColor: colors.slateSoft }]}>
                <AppText variant="caption" weight="500" color="slate">
                  Source: {lead.source.replace('_', ' ')}
                </AppText>
              </View>
            ) : null}
          </Row>
          <Row gap={0} style={styles.quickRow}>
            <QuickAction icon="phone" label="Call" disabled={!lead.mobile} onPress={() => Linking.openURL(`tel:${lead.mobile}`)} />
            <QuickAction icon="chat" label="WhatsApp" disabled={!lead.mobile} onPress={() => Linking.openURL(`https://wa.me/91${lead.mobile}`)} />
            <QuickAction icon="mail" label="Email" disabled={!lead.email} onPress={() => Linking.openURL(`mailto:${lead.email}`)} />
            <QuickAction icon="edit" label="Note" onPress={() => openSheet('note')} />
          </Row>
        </Card>

        {/* Next follow-up */}
        {followUp && !closed ? (
          <Row style={[styles.banner, { backgroundColor: overdue ? colors.dangerSoft : colors.warningSoft }]}>
            <Icon name="clock" size={18} color={overdue ? 'danger' : 'warning'} />
            <View style={{ flex: 1 }}>
              <AppText variant="label" color={overdue ? 'danger' : 'warning'}>
                {overdue ? 'Follow-up overdue' : 'Next follow-up'}
              </AppText>
              <AppText weight="600">{formatDateTime(followUp)}</AppText>
            </View>
            <Button label="Change" variant="outline" small onPress={() => openSheet('followup')} />
          </Row>
        ) : null}

        {/* Details */}
        <Card style={{ paddingVertical: 4 }}>
          <InfoRow icon="phone" label="Mobile" value={lead.mobile && `+91 ${lead.mobile}`} />
          <InfoRow icon="mail" label="Email" value={lead.email} />
          <InfoRow icon="pin" label="City" value={titleCase(lead.city)} />
          <InfoRow icon="home" label="Address" value={lead.address} />
          <InfoRow icon="user" label="Assigned to" value={assignee ?? 'Unassigned'} />
          <InfoRow icon="calendar" label="Created" value={new Date(lead.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} />
        </Card>

        {/* Actions */}
        {closed ? (
          <Card style={{ backgroundColor: colors.slateSoft }}>
            <AppText variant="label" color="textMuted" weight="400" align="center">
              This lead is {STATUS_LABEL[lead.status].toLowerCase()}. You can still add notes.
            </AppText>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            <Button label={followUp ? 'Reschedule follow-up' : 'Schedule follow-up'} icon="clock" onPress={() => openSheet('followup')} />
            <Row gap={10}>
              <Button label="Mark lost" variant="outline" icon="x" small flex onPress={() => openSheet('lost')} />
              <Button label="Mark invalid" variant="danger" icon="alert" small flex onPress={() => openSheet('invalid')} />
            </Row>
          </View>
        )}

        {/* Activity */}
        <AppText variant="section">Activity</AppText>
        <Card style={{ gap: 0 }}>
          {activities.length === 0 ? (
            <AppText color="textMuted" align="center" style={{ paddingVertical: 12 }}>
              No activity yet.
            </AppText>
          ) : (
            activities.map((a, i) => {
              const m = eventMeta(a.eventType);
              const detail = eventDetail(a);
              const last = i === activities.length - 1;
              return (
                <Row key={a._id} gap={12} style={{ alignItems: 'flex-start' }}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={[styles.dot, { backgroundColor: colors[m.tone] }]}>
                      <Icon name={m.icon} size={13} color="surface" />
                    </View>
                    {!last ? <View style={styles.line} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: last ? 0 : 16, gap: 2 }}>
                    <AppText weight="600" style={{ fontSize: 14 }}>
                      {m.label}
                    </AppText>
                    {detail ? (
                      <AppText variant="label" color="textMuted" weight="400">
                        {detail}
                      </AppText>
                    ) : null}
                    <AppText variant="caption" color="textSubtle">
                      {[a.actorId?.fullName, timeAgo(a.createdAt)].filter(Boolean).join(' · ')}
                    </AppText>
                  </View>
                </Row>
              );
            })
          )}
        </Card>
      </ScrollView>

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Icon name="check" size={16} color="surface" />
          <AppText color="surface" weight="500">
            {toast}
          </AppText>
        </View>
      ) : null}

      <Sheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        title={{ note: 'Add note', followup: 'Schedule follow-up', lost: 'Mark as lost', invalid: 'Mark as invalid', none: '' }[sheet ?? 'none']}>
        {sheet === 'followup' ? <DateTimeField label="Follow-up on" value={date} onChange={setDate} minimumDate={new Date()} /> : null}
        <Field
          label={sheet === 'note' ? 'Note' : sheet === 'followup' ? 'Note (optional)' : 'Reason'}
          placeholder={sheet === 'note' ? 'What happened?' : sheet === 'followup' ? 'What to discuss' : sheet === 'lost' ? 'e.g. Chose another vendor' : 'e.g. Wrong number'}
          multiline
          value={text}
          onChangeText={setText}
        />
        {sheet === 'followup' && date.getTime() <= now ? (
          <AppText variant="caption" color="danger">
            Pick a time in the future.
          </AppText>
        ) : null}
        {sheetError ? (
          <AppText variant="label" color="danger">
            {sheetError}
          </AppText>
        ) : null}
        <Button
          label={saving ? 'Saving…' : sheet === 'note' ? 'Add note' : sheet === 'followup' ? 'Schedule' : 'Confirm'}
          variant={sheet === 'invalid' ? 'danger' : 'primary'}
          loading={saving}
          disabled={!sheetValid}
          onPress={submitSheet}
        />
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 4, gap: 14, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  quickRow: { justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  quick: { flex: 1, alignItems: 'center', gap: 6 },
  quickIcon: { padding: 11, borderRadius: 14, backgroundColor: colors.primarySoft },
  banner: { padding: 14, borderRadius: 16 },
  infoRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, backgroundColor: colors.border, marginTop: 2 },
  toast: { position: 'absolute', bottom: 30, alignSelf: 'center', flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.text, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24 },
});
