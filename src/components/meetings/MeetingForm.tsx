import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Icon } from '@/components/ui/Icon';
import { Field, Segmented } from '@/components/ui/layout';
import { Sheet } from '@/components/ui/Sheet';
import { DURATIONS, isOfflineMeeting, Meeting, rescheduleMeeting, scheduleMeeting } from '@/lib/meetings';
import { EmployeeOption, fetchEmployees } from '@/lib/reporting';
import { useAuth } from '@/store/auth';
import { colors, radius } from '@/theme';

function defaultStart(): Date {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setSeconds(0, 0);
  const min = d.getMinutes();
  if (min !== 0) {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  }
  return d;
}

type Props = {
  mode: 'schedule' | 'reschedule';
  leadId: string;
  lead: {
    contactName?: string;
    companyName?: string;
    mobile?: string;
    email?: string;
  };
  meetingToReschedule?: Meeting | null;
  onSuccess: () => void;
  onToast: (msg: string) => void;
};

export function MeetingForm({
  mode,
  leadId,
  lead,
  meetingToReschedule,
  onSuccess,
  onToast,
}: Props) {
  const { session, isAdmin } = useAuth();

  // Schedule fields
  const [startAt, setStartAt] = useState<Date>(() =>
    mode === 'reschedule' && meetingToReschedule ? new Date(meetingToReschedule.startAt) : defaultStart(),
  );
  const [durationMin, setDuration] = useState<number>(() =>
    mode === 'reschedule' && meetingToReschedule ? meetingToReschedule.durationMin : 30,
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [notify, setNotify] = useState(true);
  // A field meeting: a venue instead of a Meet link. Rescheduling keeps the type the meeting already has.
  const [type, setType] = useState<'Online' | 'Field visit'>('Online');
  const [venue, setVenue] = useState(() => (mode === 'reschedule' ? meetingToReschedule?.venue ?? '' : ''));
  const offline = mode === 'reschedule' ? !!meetingToReschedule && isOfflineMeeting(meetingToReschedule) : type === 'Field visit';
  const venueMissing = offline && venue.trim().length < 3;
  const [hostEmployeeId, setHostEmployeeId] = useState('');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [hostPickerOpen, setHostPickerOpen] = useState(false);

  // Submission state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load active employees for admin host selection
  useEffect(() => {
    if (!isAdmin || mode !== 'schedule') return;
    let mounted = true;
    fetchEmployees()
      .then((res) => {
        if (!mounted) return;
        const active = (res ?? []).filter((e) => e.status === 'Active');
        setEmployees(active);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isAdmin, mode]);

  const now = new Date();
  const inPast = startAt.getTime() <= now.getTime();

  // A field meeting sends no Calendar invite, only WhatsApp.
  const channels = [lead.mobile && 'WhatsApp', !offline && lead.email && 'email invite'].filter(Boolean);
  const channelsText = channels.join(' and ');
  const hasChannels = channels.length > 0;

  const selectedHost = useMemo(() => {
    if (!hostEmployeeId) return null;
    return employees.find((e) => e.id === hostEmployeeId) ?? null;
  }, [hostEmployeeId, employees]);

  const selectedHostName = selectedHost ? selectedHost.fullName : session?.name ?? 'Me';
  const selectedHostMobile = selectedHost ? selectedHost.mobile : session?.mobile ?? '';

  const handleSubmit = async () => {
    if (inPast) {
      setError('The meeting must start in the future.');
      return;
    }
    if (venueMissing) {
      setError('Enter where the meeting will be.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (mode === 'schedule') {
        await scheduleMeeting({
          leadId,
          type: offline ? 'OFFLINE' : 'ONLINE',
          venue: offline ? venue : undefined,
          startAt,
          durationMin,
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          hostEmployeeId: hostEmployeeId || undefined,
          notify,
        });
        onToast('Meeting scheduled successfully');
      } else if (mode === 'reschedule' && meetingToReschedule) {
        await rescheduleMeeting(meetingToReschedule._id, {
          startAt,
          durationMin,
          venue: offline ? venue : undefined,
        });
        onToast('Meeting rescheduled');
      }
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to save meeting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Intro info */}
      {mode === 'schedule' ? <Segmented items={['Online', 'Field visit']} value={type} onChange={(v) => setType(v as typeof type)} /> : null}

      {mode === 'schedule' ? (
        <AppText variant="caption" color="textMuted">
          {offline ? 'A field meeting at a place. No link is created for ' : 'A Google Meet link will be generated for '}
          <AppText variant="caption" weight="600" color="text">
            {lead.contactName || 'the lead'}
            {lead.companyName ? ` (${lead.companyName})` : ''}
          </AppText>
          . The lead status will move to <AppText variant="caption" weight="600" color="primary">MEETING</AppText>.
        </AppText>
      ) : (
        <AppText variant="caption" color="textMuted">
          Currently scheduled for{' '}
          <AppText variant="caption" weight="600" color="text">
            {meetingToReschedule ? new Date(meetingToReschedule.startAt).toLocaleString() : ''}
          </AppText>
          . {offline ? 'You can change the place too' : 'The Google Meet link will stay the same'}
          {meetingToReschedule?.notify ? ' and the lead will be notified of the new time.' : '.'}
        </AppText>
      )}

      {offline ? (
        <Field label="Venue" placeholder="Address or place of the meeting" value={venue} onChangeText={setVenue} maxLength={300} />
      ) : null}

      {/* Date & Time Picker */}
      <View style={{ gap: 4 }}>
        <DateTimeField
          label="Start date & time"
          value={startAt}
          minimumDate={now}
          onChange={(d) => {
            setStartAt(d);
            if (error) setError(null);
          }}
        />
        {inPast ? (
          <AppText variant="caption" color="danger" weight="600">
            Pick a time in the future.
          </AppText>
        ) : null}
      </View>

      {/* Duration selector */}
      <View style={{ gap: 6 }}>
        <AppText variant="label" color="textMuted">
          Duration
        </AppText>
        <View style={styles.durationsRow}>
          {DURATIONS.map((d) => {
            const isSelected = durationMin === d;
            return (
              <Pressable
                key={d}
                onPress={() => setDuration(d)}
                style={[styles.durationChip, isSelected && styles.durationChipSelected]}
              >
                <AppText
                  variant="caption"
                  weight={isSelected ? '700' : '500'}
                  color={isSelected ? 'primary' : 'text'}
                >
                  {d}m
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {mode === 'schedule' ? (
        <>
          {/* Title */}
          <Field
            label="Title (optional)"
            placeholder={`${offline ? 'Visit to' : 'Meeting with'} ${lead.companyName || lead.contactName || 'Lead'}`}
            value={title}
            onChangeText={setTitle}
            maxLength={120}
          />

          {/* Agenda */}
          <Field
            label="Agenda (optional)"
            placeholder="What will you cover?"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={2000}
          />

          {/* Host Picker (Admin Only) */}
          {isAdmin ? (
            <View style={{ gap: 6 }}>
              <AppText variant="label" color="textMuted">
                Host Employee
              </AppText>
              <Pressable onPress={() => setHostPickerOpen(true)} style={styles.pickerBox}>
                <Icon name="user" size={18} color="textSubtle" />
                <AppText style={{ flex: 1 }}>{selectedHostName}</AppText>
                <Icon name="chevD" size={18} color="textSubtle" />
              </Pressable>
            </View>
          ) : null}

          {/* Notify checkbox */}
          <Pressable onPress={() => setNotify((v) => !v)} style={styles.notifyBox}>
            <View style={[styles.checkbox, notify && styles.checkboxSelected]}>
              {notify ? <Icon name="check" size={14} color="surface" /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText weight="600" color="text">
                {offline ? 'Tell the lead the time and place' : 'Send the link to the lead'}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {hasChannels
                  ? `Sent now by ${channelsText}, with a reminder before the meeting.`
                  : `This lead has no mobile${offline ? '' : ' or email'}, ${offline ? 'tell them yourself.' : 'share the link directly.'}`}
              </AppText>
            </View>
          </Pressable>

          {/* Who gets what summary */}
          <View style={styles.summaryBox}>
            <AppText variant="caption" weight="700" color="textMuted" style={{ textTransform: 'uppercase', fontSize: 10 }}>
              Who gets what
            </AppText>
            <AppText variant="caption" color="text">
              <AppText variant="caption" weight="600">
                Host ({selectedHostName}):{' '}
              </AppText>
              {offline ? (selectedHostMobile ? `WhatsApp to ${selectedHostMobile} — place and time now, reminder before the visit.` : 'No message (no mobile).') : `Google Calendar invite to email${selectedHostMobile ? `, WhatsApp to ${selectedHostMobile}` : ''} — Meet link now, reminder before meeting.`}
            </AppText>
            <AppText variant="caption" color="text">
              <AppText variant="caption" weight="600">
                Lead ({lead.contactName || 'Lead'}):{' '}
              </AppText>
              {notify && hasChannels
                ? `${!offline && lead.email ? `Calendar invite to ${lead.email}` : ''}${!offline && lead.email && lead.mobile ? ', ' : ''}${lead.mobile ? `WhatsApp to ${lead.mobile}` : ''} — ${offline ? 'place and time now' : 'Meet link now'}, reminder before meeting.`
                : 'Nothing sent automatically.'}
            </AppText>
            {offline ? (
              <AppText variant="caption" color="textMuted">
                Marking a field meeting Done needs a note and your location, so it is on record that you were there.
              </AppText>
            ) : null}
          </View>
        </>
      ) : null}

      {/* Error banner */}
      {error ? (
        <View style={styles.errorBox}>
          <Icon name="alert" size={16} color="danger" />
          <AppText variant="caption" color="danger" weight="600" style={{ flex: 1 }}>
            {error}
          </AppText>
        </View>
      ) : null}

      {/* Submit Button */}
      <Button
        label={mode === 'schedule' ? 'Schedule meeting' : 'Reschedule meeting'}
        variant="primary"
        loading={saving}
        disabled={inPast || saving || venueMissing}
        onPress={handleSubmit}
      />

      {/* Host Picker Sheet for Admin */}
      {isAdmin && hostPickerOpen ? (
        <Sheet visible={hostPickerOpen} title="Select Host Employee" onClose={() => setHostPickerOpen(false)}>
          <ScrollView style={{ maxHeight: 300 }}>
            <Pressable
              onPress={() => {
                setHostEmployeeId('');
                setHostPickerOpen(false);
              }}
              style={styles.hostOption}
            >
              <AppText weight={!hostEmployeeId ? '700' : '400'} color={!hostEmployeeId ? 'primary' : 'text'}>
                Me ({session?.name})
              </AppText>
              {!hostEmployeeId ? <Icon name="check" size={18} color="primary" /> : null}
            </Pressable>
            {employees.map((emp) => {
              const isSelected = hostEmployeeId === emp.id;
              return (
                <Pressable
                  key={emp.id}
                  onPress={() => {
                    setHostEmployeeId(emp.id);
                    setHostPickerOpen(false);
                  }}
                  style={styles.hostOption}
                >
                  <AppText weight={isSelected ? '700' : '400'} color={isSelected ? 'primary' : 'text'}>
                    {emp.fullName}
                  </AppText>
                  {isSelected ? <Icon name="check" size={18} color="primary" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Sheet>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingBottom: 24,
  },
  durationsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  durationChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  durationChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  pickerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  notifyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.textSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    backgroundColor: colors.surface,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  summaryBox: {
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.slateSoft,
    gap: 6,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  hostOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
