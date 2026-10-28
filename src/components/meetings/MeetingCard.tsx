import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Card, Row } from '@/components/ui/layout';
import { Sheet } from '@/components/ui/Sheet';
import {
  fetchMyEmployeeId,
  formatDuration,
  hostName,
  isActiveMeeting,
  isOfflineMeeting,
  linkParticipant,
  Meeting,
  MeetingParticipant,
  meetingStatusLabel,
  meetingStatusTone,
  reminderState,
  syncMeeting,
  venueMapUrl,
} from '@/lib/meetings';
import { mapUrl } from '@/lib/leads';
import { EmployeeOption, fetchEmployees } from '@/lib/reporting';
import { useAuth } from '@/store/auth';
import { colors, radius } from '@/theme';

function formatMeetingSlot(startIso: string, endIso: string, durationMin: number): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateStr = start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const startTimeStr = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const endTimeStr = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${dateStr} · ${startTimeStr} – ${endTimeStr} (${durationMin} min)`;
}

function formatClock(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function userTypeLabel(userType: MeetingParticipant['userType']): string {
  if (userType === 'SIGNED_IN') return 'Google account';
  if (userType === 'PHONE') return 'Phone';
  return 'Not signed in';
}

/**
 * Google never gives a participant's email unless they are in our directory, but it always gives a stable Google
 * account id. Linking it to an employee once makes every meeting recognise that person as team.
 * A wrong link is hard to undo, so "This is me" asks once before saving.
 */
function LinkControl({
  meetingId,
  participant,
  isAdmin,
  onLinked,
}: {
  meetingId: string;
  participant: MeetingParticipant;
  isAdmin: boolean;
  onLinked: (message: string) => void;
}) {
  const { session } = useAuth();
  const [step, setStep] = useState<'idle' | 'me' | 'other'>('idle');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [picked, setPicked] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (participant.userType !== 'SIGNED_IN' || !participant.googleUserId) return null;
  const googleUserId = participant.googleUserId;
  const tag = ` …${googleUserId.slice(-4)}`;

  const close = () => {
    setStep('idle');
    setPicked('');
    setError('');
  };

  const openOther = async () => {
    setError('');
    setStep('other');
    try {
      setEmployees((await fetchEmployees()).filter((e) => e.status === 'Active'));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async (employeeId: () => Promise<string> | string, done: string) => {
    setSaving(true);
    setError('');
    try {
      await linkParticipant(meetingId, { googleUserId, employeeId: await employeeId() });
      close();
      onLinked(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Row gap={16} style={{ marginTop: 4 }}>
        <Pressable onPress={() => setStep('me')} hitSlop={8}>
          <AppText variant="caption" weight="600" color="primary">
            This is me
          </AppText>
        </Pressable>
        {isAdmin ? (
          <Pressable onPress={openOther} hitSlop={8}>
            <AppText variant="caption" weight="600" color="textMuted">
              This is another team member
            </AppText>
          </Pressable>
        ) : null}
      </Row>

      <Sheet visible={step === 'me'} onClose={close} title="Link your Google account">
        <AppText variant="label" color="textMuted" weight="400">
          Link the Google account{tag} to you{session?.name ? ` (${session.name})` : ''}? You will be recognised as team in every meeting.
        </AppText>
        {error ? (
          <AppText variant="label" color="danger">
            {error}
          </AppText>
        ) : null}
        <Row gap={10}>
          <Button label="No" variant="outline" flex onPress={close} />
          <Button
            label={saving ? 'Saving…' : 'Yes, this is me'}
            flex
            loading={saving}
            onPress={() => save(fetchMyEmployeeId, 'Saved. You will be recognised as team in every meeting.')}
          />
        </Row>
      </Sheet>

      <Sheet visible={step === 'other'} onClose={close} title="Which employee is this?" fullHeight>
        <AppText variant="label" color="textMuted" weight="400">
          Google account{tag} ({participant.displayName || 'Unknown'})
        </AppText>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
          {employees.map((e) => (
            <Pressable
              key={e.id}
              onPress={() => setPicked(e.id)}
              style={[styles.employeeOption, picked === e.id && styles.employeeOptionOn]}
            >
              <AppText weight="500" style={{ flex: 1 }}>
                {e.fullName}
              </AppText>
              {picked === e.id ? <Icon name="check" size={16} color="primary" /> : null}
            </Pressable>
          ))}
        </ScrollView>
        {error ? (
          <AppText variant="label" color="danger">
            {error}
          </AppText>
        ) : null}
        <Button
          label={saving ? 'Saving…' : 'Save'}
          loading={saving}
          disabled={!picked}
          onPress={() => save(() => picked, 'Saved. This person will be recognised as team in every meeting.')}
        />
      </Sheet>
    </>
  );
}

function StatusPill({ status }: { status: Meeting['status'] }) {
  const [fg, bg] = meetingStatusTone(status);
  return (
    <View style={[styles.pill, { backgroundColor: colors[bg] }]}>
      <AppText variant="caption" weight="700" color={fg} style={{ textTransform: 'uppercase' }}>
        {meetingStatusLabel(status)}
      </AppText>
    </View>
  );
}

function InfoRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  const valColor = ok === undefined ? 'text' : ok ? 'success' : 'textMuted';
  return (
    <View style={styles.metricItem}>
      <AppText variant="caption" weight="600" color="textMuted" style={{ textTransform: 'uppercase', fontSize: 10 }}>
        {label}
      </AppText>
      <AppText variant="caption" weight="600" color={valColor}>
        {value}
      </AppText>
    </View>
  );
}

type Props = {
  meeting: Meeting;
  canModify: boolean;
  isAdmin: boolean;
  onReschedule: (m: Meeting) => void;
  onCancel: (m: Meeting) => void;
  onMarkDone: (m: Meeting) => void;
  onNotHappened: (m: Meeting) => void;
  onRefresh: () => void;
  onToast: (msg: string) => void;
};

export function MeetingCard({
  meeting,
  canModify,
  isAdmin,
  onReschedule,
  onCancel,
  onMarkDone,
  onNotHappened,
  onRefresh,
  onToast,
}: Props) {
  const [showParticipants, setShowParticipants] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // Open meetings start expanded; finished and cancelled ones start collapsed so a long list stays short.
  const [expanded, setExpanded] = useState(() => isActiveMeeting(meeting.status));

  const active = isActiveMeeting(meeting.status);
  const [now] = useState(() => Date.now());
  const started = now >= new Date(meeting.startAt).getTime();
  const canMark = meeting.status !== 'CANCELLED' && started && (active || isAdmin);
  const suggestion = meeting.suggestedStatus;
  const reminder = reminderState(meeting);
  const host = hostName(meeting);
  const { tracking } = meeting;
  const offline = isOfflineMeeting(meeting);

  const copyLink = async () => {
    if (!meeting.meetLink) return;
    try {
      await Clipboard.setStringAsync(meeting.meetLink);
      onToast('Meeting link copied to clipboard');
    } catch {
      onToast('Could not copy link');
    }
  };

  const handleRefreshAttendance = async () => {
    setSyncing(true);
    try {
      await syncMeeting(meeting._id);
      onToast('Attendance refreshed');
      onRefresh();
    } catch (err) {
      onToast((err as Error).message || 'Attendance sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card style={meeting.status === 'CANCELLED' ? { ...styles.card, ...styles.cancelledCard } : styles.card}>
      {/* Header: tap to expand or collapse the card */}
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={styles.headerRow}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={expanded ? 'Collapse meeting' : 'Expand meeting'}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="700" numberOfLines={1}>
            {meeting.title}
            {offline ? ' · Field' : ''}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {formatMeetingSlot(meeting.startAt, meeting.endAt, meeting.durationMin)}
            {host ? ` · Host: ${host}` : ''}
            {meeting.rescheduleCount > 0 ? ` · Rescheduled ×${meeting.rescheduleCount}` : ''}
          </AppText>
        </View>
        <StatusPill status={meeting.status} />
        <Icon name={expanded ? 'chevD' : 'chevR'} size={18} color="textMuted" />
      </Pressable>

      {expanded ? (
        <>
      {/* Field meeting: the place, with a Maps shortcut (no link exists) */}
      {offline && meeting.venue && meeting.status !== 'CANCELLED' ? (
        <View style={styles.linkRow}>
          <View style={styles.linkBox}>
            <Icon name="pin" size={16} color="primary" />
            <AppText variant="caption" color="text" style={{ flex: 1 }}>
              {meeting.venue}
            </AppText>
          </View>
          <Button label="Maps" variant="outline" small onPress={() => Linking.openURL(venueMapUrl(meeting.venue!))} />
        </View>
      ) : null}

      {/* Meet link & Join */}
      {!offline && meeting.status !== 'CANCELLED' && meeting.meetLink ? (
        <View style={styles.linkRow}>
          <Pressable onPress={copyLink} style={styles.linkBox}>
            <Icon name="video" size={16} color="primary" />
            <AppText variant="caption" color="text" numberOfLines={1} style={{ flex: 1 }}>
              {meeting.meetLink}
            </AppText>
            <Icon name="plus" size={14} color="textMuted" />
          </Pressable>
          <Button label="Copy" variant="outline" small onPress={copyLink} />
          {active ? (
            <Button
              label="Join"
              variant="primary"
              small
              icon="video"
              onPress={() => Linking.openURL(meeting.meetLink!)}
            />
          ) : null}
        </View>
      ) : null}

      {/* Messaging and Attendance Stats */}
      {meeting.status !== 'CANCELLED' ? (
        <View style={styles.metricsGrid}>
          <InfoRow
            label="Lead messaged"
            value={
              meeting.notify
                ? meeting.linkSentAt
                  ? `${offline ? 'Venue' : 'Link'} ${formatClock(meeting.linkSentAt)}`
                  : 'Not sent'
                : 'Off'
            }
            ok={meeting.notify ? !!meeting.linkSentAt : undefined}
          />
          <InfoRow
            label="Host messaged"
            value={
              meeting.employeeLinkSentAt
                ? `${offline ? 'Venue' : 'Link'} ${formatClock(meeting.employeeLinkSentAt)}`
                : 'Not sent'
            }
            ok={!!meeting.employeeLinkSentAt}
          />
          <InfoRow
            label="Reminder"
            value={reminder.text === 'Sent' ? `Sent ${formatClock(meeting.reminderSentAt)}` : reminder.text}
            ok={reminder.ok}
          />
          {!offline ? (
            <>
              <InfoRow
                label="Outside join"
                value={
                  tracking.externalJoined
                    ? `Joined ${formatClock(tracking.firstExternalJoinAt)}`
                    : started
                    ? 'Not joined'
                    : '—'
                }
                ok={tracking.externalJoined ? true : started ? false : undefined}
              />
              <InfoRow
                label="Our team"
                value={
                  tracking.employeeJoined
                    ? `Joined ${formatClock(tracking.firstEmployeeJoinAt)}`
                    : started
                    ? 'Not joined'
                    : '—'
                }
                ok={tracking.employeeJoined ? true : started ? false : undefined}
              />
            </>
          ) : null}
          {offline && meeting.status === 'DONE' ? (
            meeting.checkIn ? (
              <Pressable style={styles.metricItem} onPress={() => Linking.openURL(mapUrl(meeting.checkIn)!)}>
                <AppText variant="caption" weight="600" color="textMuted" style={{ textTransform: 'uppercase', fontSize: 10 }}>
                  Check-in
                </AppText>
                <AppText variant="caption" weight="600" color="success">
                  {formatClock(meeting.checkIn.at)} · view on map
                </AppText>
              </Pressable>
            ) : (
              <InfoRow label="Check-in" value="No location recorded" ok={false} />
            )
          ) : null}
        </View>
      ) : null}

      {/* Outcome Note */}
      {meeting.outcomeNote ? (
        <View style={styles.noteBanner}>
          <AppText variant="caption" color="textMuted" weight="500">
            Note: {meeting.outcomeNote}
          </AppText>
        </View>
      ) : null}

      {/* Tracking error banner */}
      {!offline && tracking.error ? (
        <View style={styles.errorBox}>
          <AppText variant="caption" color="danger" weight="600">
            Attendance could not be read from Google Meet. Press Refresh to try again.
          </AppText>
          <AppText variant="caption" color="danger" style={{ opacity: 0.8 }}>
            {tracking.error}
          </AppText>
        </View>
      ) : null}

      {/* Suggestion banner */}
      {suggestion && canModify && canMark ? (
        <View
          style={[
            styles.suggestionBox,
            { backgroundColor: suggestion === 'DONE' ? colors.successSoft : colors.dangerSoft },
          ]}
        >
          <Icon
            name={suggestion === 'DONE' ? 'check' : 'alert'}
            size={16}
            color={suggestion === 'DONE' ? 'success' : 'danger'}
          />
          <AppText
            variant="caption"
            weight="600"
            color={suggestion === 'DONE' ? 'success' : 'danger'}
            style={{ flex: 1 }}
          >
            {suggestion === 'DONE'
              ? 'Someone from outside joined. Mark this meeting as done?'
              : 'Nobody from outside joined. Mark this meeting as Not attend?'}
          </AppText>
        </View>
      ) : null}

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        {canModify && canMark && meeting.status !== 'DONE' ? (
          <Button
            label="Mark done"
            variant={suggestion === 'DONE' ? 'success' : 'outline'}
            icon="check"
            small
            onPress={() => onMarkDone(meeting)}
          />
        ) : null}
        {canModify && canMark && meeting.status !== 'NOT_HAPPENED' ? (
          <Button
            label="Not attend"
            variant={suggestion === 'NOT_HAPPENED' ? 'danger' : 'outline'}
            icon="x"
            small
            onPress={() => onNotHappened(meeting)}
          />
        ) : null}
        {canModify && meeting.status === 'SCHEDULED' && !started ? (
          <Button
            label="Reschedule"
            variant="outline"
            icon="clock"
            small
            onPress={() => onReschedule(meeting)}
          />
        ) : null}
        {canModify && active ? (
          <Button
            label="Cancel"
            variant="outline"
            icon="x"
            small
            onPress={() => onCancel(meeting)}
          />
        ) : null}
        {!offline && meeting.status !== 'CANCELLED' ? (
          <Button
            label="Refresh"
            variant="soft"
            icon="refresh"
            small
            loading={syncing}
            onPress={handleRefreshAttendance}
          />
        ) : null}
      </View>

      {/* Toggle Who joined */}
      {!offline && meeting.status !== 'CANCELLED' ? (
        <Pressable
          onPress={() => setShowParticipants((v) => !v)}
          style={styles.participantsToggle}
        >
          <Row gap={6} style={{ alignItems: 'center' }}>
            <Icon name="users" size={15} color="textMuted" />
            <AppText variant="caption" weight="600" color="textMuted">
              Who joined ({tracking.participants.length})
            </AppText>
          </Row>
          <Icon name={showParticipants ? 'chevD' : 'chevR'} size={15} color="textMuted" />
        </Pressable>
      ) : null}

      {/* Who joined list (Phase 2) */}
      {!offline && showParticipants && meeting.status !== 'CANCELLED' ? (
        <View style={styles.participantsContainer}>
          {tracking.participants.length === 0 ? (
            <AppText variant="caption" color="textMuted" style={{ padding: 8, fontStyle: 'italic' }}>
              Nobody has joined yet.
            </AppText>
          ) : (
            tracking.participants.map((p, idx) => {
              const tagFg = p.isEmployee ? 'primary' : 'warning';
              const tagBg = p.isEmployee ? 'primarySoft' : 'warningSoft';
              return (
                <View
                  key={`${p.googleUserId ?? p.displayName}-${idx}`}
                  style={[styles.participantItem, idx > 0 && styles.participantDivider]}
                >
                  <View style={styles.participantTopRow}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="caption" weight="600" color="text" numberOfLines={1}>
                        {p.displayName || 'Unknown participant'}
                        {p.googleUserId ? (
                          <AppText variant="caption" color="textMuted">
                            {` …${p.googleUserId.slice(-4)}`}
                          </AppText>
                        ) : null}
                      </AppText>
                      <AppText variant="caption" color="textMuted" style={{ fontSize: 11 }}>
                        {userTypeLabel(p.userType)}
                        {p.email ? ` · ${p.email}` : p.emailLookup === 'UNAVAILABLE' ? ' · email hidden by Google' : ''}
                      </AppText>
                    </View>
                    <View style={[styles.participantBadge, { backgroundColor: colors[tagBg] }]}>
                      <AppText variant="caption" weight="700" color={tagFg} style={{ fontSize: 10 }}>
                        {p.isEmployee ? 'TEAM' : 'OUTSIDE'}
                      </AppText>
                    </View>
                  </View>

                  <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
                    <AppText variant="caption" color="textMuted" style={{ fontSize: 11 }}>
                      Total time: <AppText variant="caption" weight="600" color="text">{formatDuration(p.totalSeconds)}</AppText>
                    </AppText>
                    {p.sessions.length > 0 && p.sessions[0].joinAt ? (
                      <AppText variant="caption" color="textMuted" style={{ fontSize: 11 }}>
                        First joined: {formatClock(p.sessions[0].joinAt)}
                      </AppText>
                    ) : null}
                  </Row>

                  {p.sessions.length > 0 ? (
                    <AppText variant="caption" color="textMuted" style={{ fontSize: 11 }}>
                      {p.sessions.map((s) => `${formatClock(s.joinAt)}–${s.leaveAt ? formatClock(s.leaveAt) : 'now'}`).join(' · ')}
                    </AppText>
                  ) : null}

                  {!p.isEmployee ? (
                    <LinkControl
                      meetingId={meeting._id}
                      participant={p}
                      isAdmin={isAdmin}
                      onLinked={(message) => {
                        onToast(message);
                        onRefresh();
                      }}
                    />
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      ) : null}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelledCard: {
    opacity: 0.7,
    backgroundColor: colors.slateSoft,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  metricItem: {
    minWidth: '45%',
    gap: 2,
  },
  noteBanner: {
    padding: 8,
    backgroundColor: colors.slateSoft,
    borderRadius: radius.sm,
  },
  errorBox: {
    padding: 10,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    gap: 4,
  },
  suggestionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  participantsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  participantsContainer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  participantItem: {
    padding: 10,
    gap: 4,
  },
  participantDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  participantTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  employeeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  employeeOptionOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  participantBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
});
