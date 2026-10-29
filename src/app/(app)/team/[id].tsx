import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon, IconName } from '@/components/ui/Icon';
import { Avatar, Card, Header, IconButton, Row, SectionHeader, Track } from '@/components/ui/layout';
import { activityMeta, eventDetail } from '@/components/leads/meta';
import { rupees } from '@/lib/customers';
import { Activity, mapUrl } from '@/lib/leads';
import {
  AttendanceDay,
  attendanceHours,
  DashboardRow,
  EmployeeActivity,
  EmployeeDetails,
  fetchAttendance,
  fetchDashboardRows,
  fetchEmployee,
  fetchEmployeeActivities,
  ROLE_LABEL,
  statusTone,
  ymd,
} from '@/lib/reporting';
import { ColorName, colors } from '@/theme';

const timeOf = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '–');
const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);

function Stat({ label, value, icon, tone }: { label: string; value: number | string; icon: IconName; tone: ColorName }) {
  return (
    <View style={styles.stat}>
      <Row gap={6}>
        <Icon name={icon} size={14} color={tone} />
        <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </AppText>
      </Row>
      <AppText variant="section">{value}</AppText>
    </View>
  );
}

/** "< September 2026 >" / "< Today >" pager. `next` is disabled when it would go into the future. */
function Pager({ label, onPrev, onNext, nextDisabled }: { label: string; onPrev: () => void; onNext: () => void; nextDisabled: boolean }) {
  return (
    <Row style={styles.pager}>
      <Pressable onPress={onPrev} hitSlop={10} style={styles.pagerBtn}>
        <Icon name="chevL" size={18} />
      </Pressable>
      <AppText weight="600" align="center" style={{ flex: 1 }}>
        {label}
      </AppText>
      <Pressable onPress={nextDisabled ? undefined : onNext} hitSlop={10} style={[styles.pagerBtn, nextDisabled && { opacity: 0.3 }]}>
        <Icon name="chevR" size={18} />
      </Pressable>
    </Row>
  );
}

/** Activity entries shown at first, and added per "Read more". */
const ACTIVITY_PAGE = 10;

const DOC_LABEL: Record<string, string> = {
  GOVT_ID_FRONT: 'Govt ID (front)',
  GOVT_ID_BACK: 'Govt ID (back)',
  QUALIFICATION: 'Qualification',
  EXPERIENCE: 'Experience / Payslip',
  JOB_AGREEMENT: 'Job agreement',
};
const addressText = (a: { line1?: string; city?: string; state?: string; pinCode?: string }) => [a.line1, a.city, a.state, a.pinCode].filter(Boolean).join(', ');

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="caption" color="textSubtle">
        {label}
      </AppText>
      <AppText variant="label" weight="500">
        {value || '–'}
      </AppText>
    </View>
  );
}

/** Onboarding details from the web Add Employee form. Read-only here: they are edited on the web. */
function OnboardingCard({ e }: { e: EmployeeDetails }) {
  const tone = statusTone(e.status);
  const present = e.presentAddressSame === false && e.presentAddress ? addressText(e.presentAddress) : 'Same as permanent';
  const docs = e.documents ?? [];
  return (
    <Card style={{ gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="section">Details</AppText>
        <View style={[styles.statusPill, { backgroundColor: colors[`${tone}Soft`] }]}>
          <AppText variant="caption" weight="600" color={tone}>
            {e.status}
          </AppText>
        </View>
      </Row>
      {e.status === 'Draft' ? (
        <AppText variant="caption" color="warning">
          Draft: cannot sign in yet. Finish the details and documents on the web, then press Submit & create ID pass.
        </AppText>
      ) : null}
      <Detail label="Joined" value={e.joiningDate ? new Date(e.joiningDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null} />
      <Detail label="Email" value={e.email} />
      <Detail label="Alternate number" value={e.alternateMobile} />
      <Detail label="Permanent address" value={addressText({ line1: e.addressLine1, city: e.city, state: e.state, pinCode: e.pinCode })} />
      <Detail label="Present address" value={present} />
      <Detail label="Guardian" value={[e.guardianName, e.guardianContact].filter(Boolean).join(' · ')} />
      <Detail label="Reference" value={[e.refPersonName, e.refPersonContact].filter(Boolean).join(' · ')} />
      <Detail label="Last qualification" value={e.lastQualification} />
      <View style={{ gap: 6 }}>
        <AppText variant="caption" color="textSubtle">
          Documents
        </AppText>
        {docs.length ? (
          docs.map((d) => (
            <Pressable key={d.publicId} onPress={() => Linking.openURL(d.url)} style={styles.docRow}>
              <Icon name="file" size={16} color="primary" />
              <AppText variant="label" color="primary" numberOfLines={1} style={{ flex: 1 }}>
                {(d.category && DOC_LABEL[d.category]) || d.name}
              </AppText>
              <Icon name="chevR" size={14} color="textSubtle" />
            </Pressable>
          ))
        ) : (
          <AppText variant="label" weight="500">
            –
          </AppText>
        )}
      </View>
    </Card>
  );
}

// Admin: one employee's month (numbers, target, attendance) and what they did on a given day.
export default function TeamMember() {
  const router = useRouter();
  const p = useLocalSearchParams<{ id: string; name?: string; role?: string; mobile?: string; status?: string }>();
  const id = p.id;
  const now = new Date();

  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [day, setDay] = useState(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const [row, setRow] = useState<DashboardRow | null>(null);
  const [attendance, setAttendance] = useState<AttendanceDay[]>([]);
  const [monthLoading, setMonthLoading] = useState(true);
  const [monthError, setMonthError] = useState('');
  const [activities, setActivities] = useState<EmployeeActivity[]>([]);
  const [dayLoading, setDayLoading] = useState(true);
  const [dayError, setDayError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const isThisMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();

  // Bumping a key re-runs its effect (Retry / pull-to-refresh).
  const [monthKey, setMonthKey] = useState(0);
  const [dayKey, setDayKey] = useState(0);
  // The day's activity shows the latest ACTIVITY_PAGE entries; "Read more" adds the next ones (same as the web).
  const [activityShown, setActivityShown] = useState(ACTIVITY_PAGE);

  // The onboarding details (address, guardian, documents...). A failure only hides the card: the month view still works.
  const [details, setDetails] = useState<EmployeeDetails | null>(null);
  useEffect(() => {
    let stale = false;
    fetchEmployee(id)
      .then((e) => {
        if (!stale) setDetails(e);
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, [id, monthKey]);

  // Month numbers + attendance. `stale` drops a response when the month changed meanwhile.
  useEffect(() => {
    let stale = false;
    const y = month.getFullYear();
    const m = month.getMonth();
    const today = new Date();
    const end = y === today.getFullYear() && m === today.getMonth() ? today : new Date(y, m + 1, 0);
    Promise.all([fetchDashboardRows(month, end), fetchAttendance(id, y, m + 1)])
      .then(([rows, days]) => {
        if (stale) return;
        setRow(rows.find((r) => r.employeeId === id) ?? null);
        setAttendance(days);
        setMonthError('');
      })
      .catch((e: Error) => {
        if (!stale) setMonthError(e.message);
      })
      .finally(() => {
        if (!stale) {
          setMonthLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      stale = true;
    };
  }, [id, month, monthKey]);

  // Activity of the selected day.
  useEffect(() => {
    let stale = false;
    fetchEmployeeActivities(id, day)
      .then((list) => {
        if (stale) return;
        setActivities(list);
        setDayError('');
      })
      .catch((e: Error) => {
        if (!stale) setDayError(e.message);
      })
      .finally(() => {
        if (!stale) setDayLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [id, day, dayKey]);

  const loadMonth = () => {
    setMonthLoading(true);
    setMonthKey((k) => k + 1);
  };
  const loadDay = () => {
    setDayLoading(true);
    setDayKey((k) => k + 1);
  };
  const refresh = () => {
    setRefreshing(true);
    loadMonth();
    loadDay();
  };

  // Coming back from "Set target": reload so the new target shows.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      setMonthKey((k) => k + 1);
    }, []),
  );

  // Tapping a day in Attendance scrolls down to that day's activity.
  const scrollRef = useRef<ScrollView>(null);
  const activityY = useRef(0);
  const showDay = (d: Date) => {
    pickDay(d);
    scrollRef.current?.scrollTo({ y: Math.max(0, activityY.current - 8), animated: true });
  };

  const name = row?.employeeName ?? p.name ?? 'Employee';
  const role = row?.role ?? p.role ?? '';
  const mobile = row?.mobile ?? p.mobile;
  const status = details?.status ?? row?.status ?? p.status;
  // Inactive, Terminated or Draft is shown next to the role; Active is the normal case.
  const statusNote = status && status !== 'Active' ? status : null;
  const goal = row?.targetRevenue ?? 0;
  const pct = goal > 0 ? (row?.achievedAmount ?? 0) / goal : 0;

  const present = attendance.filter((d) => d.firstActivityAt);
  const fullDays = present.filter((d) => attendanceHours(d) > 4).length;
  const halfDays = present.length - fullDays;
  const workdays = isThisMonth ? now.getDate() : new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  // Loading flags are set here (not inside the effects) so the effect bodies only set state after awaiting.
  const shiftMonth = (n: number) => {
    setMonthLoading(true);
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  };
  const pickDay = (d: Date) => {
    if (ymd(d) === ymd(day)) return;
    setDayLoading(true);
    setActivityShown(ACTIVITY_PAGE);
    setDay(d);
  };
  const shiftDay = (n: number) => pickDay(new Date(day.getFullYear(), day.getMonth(), day.getDate() + n));
  const dayLabel = sameDay(day, now)
    ? 'Today'
    : sameDay(day, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
      ? 'Yesterday'
      : day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  const openEntity = (a: EmployeeActivity) => {
    if (!a.entityId?._id) return;
    if (a.entityType === 'Lead') router.push({ pathname: '/lead/[id]', params: { id: a.entityId._id } });
    else if (a.entityType === 'Customer') router.push({ pathname: '/customers/[id]', params: { id: a.entityId._id } });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header title={name} subtitle={[ROLE_LABEL[role] ?? role, statusNote].filter(Boolean).join(' · ')} back />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}>
        {/* Contact */}
        <Card>
          <Row>
            <Avatar name={name} size={48} />
            <View style={{ flex: 1 }}>
              <AppText variant="section" numberOfLines={1}>
                {name}
              </AppText>
              <AppText variant="label" color="textMuted" weight="400">
                {mobile || 'No mobile'}
              </AppText>
            </View>
            {mobile ? (
              <>
                <IconButton icon="chat" onPress={() => Linking.openURL(`https://wa.me/91${mobile}`)} />
                <IconButton icon="phone" onPress={() => Linking.openURL(`tel:${mobile}`)} />
              </>
            ) : null}
          </Row>
        </Card>

        {details ? <OnboardingCard e={details} /> : null}

        {/* Month */}
        <Pager
          label={month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
          nextDisabled={isThisMonth}
        />

        {monthLoading && !row ? (
          <ActivityIndicator color={colors.primary} />
        ) : monthError ? (
          <Card borderColor="danger">
            <Row>
              <Icon name="alert" size={18} color="danger" />
              <AppText color="danger" style={{ flex: 1 }}>
                {monthError}
              </AppText>
              <AppText color="primary" weight="600" onPress={loadMonth}>
                Retry
              </AppText>
            </Row>
          </Card>
        ) : (
          <View style={{ gap: 16, opacity: monthLoading ? 0.5 : 1 }}>
            {/* Target */}
            <Card style={{ gap: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={8}>
                  <Icon name="target" size={16} color="primary" />
                  <AppText weight="600">Target</AppText>
                </Row>
                {goal > 0 ? (
                  <AppText weight="600" color={pct >= 1 ? 'success' : 'text'}>
                    {Math.round(pct * 100)}%
                  </AppText>
                ) : null}
              </Row>
              {goal > 0 ? (
                <>
                  <Track pct={pct} tone={pct >= 1 ? 'success' : 'primary'} />
                  <AppText variant="caption" color="textMuted">
                    {rupees(row?.achievedAmount)} achieved of {rupees(goal)} · {rupees(row?.collectionAmount)} collected
                  </AppText>
                </>
              ) : (
                <Row style={{ justifyContent: 'space-between' }}>
                  <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
                    No target set for this month.
                  </AppText>
                  <Button label="Set target" icon="target" variant="soft" small onPress={() => router.push('/team/target')} />
                </Row>
              )}
            </Card>

            {/* Numbers */}
            <View style={styles.stats}>
              <Stat label="Leads taken" value={row?.totalLeads ?? 0} icon="users" tone="primary" />
              <Stat label="Follow-ups set" value={row?.followUps ?? 0} icon="clock" tone="warning" />
              <Stat label="Proposals sent" value={row?.proposals ?? 0} icon="file" tone="purple" />
              <Stat label="Deals closed" value={row?.dealsClosed ?? 0} icon="check" tone="success" />
            </View>

            {/* Attendance */}
            <SectionHeader title="Attendance" />
            <Card style={{ gap: 0, paddingVertical: 4 }}>
              <Row style={styles.attSummary}>
                <View style={{ flex: 1 }}>
                  <AppText variant="heading">
                    {present.length}
                    <AppText color="textMuted" weight="400">
                      {' '}
                      / {workdays} days
                    </AppText>
                  </AppText>
                  <AppText variant="caption" color="textMuted">
                    {fullDays} full · {halfDays} half day{halfDays === 1 ? '' : 's'}
                  </AppText>
                </View>
              </Row>
              {present.length === 0 ? (
                <AppText variant="label" color="textMuted" weight="400" style={styles.attRow}>
                  No activity recorded this month.
                </AppText>
              ) : (
                present.map((d) => {
                  const date = new Date(`${d.date}T00:00:00`);
                  const h = attendanceHours(d);
                  const selected = ymd(date) === ymd(day);
                  return (
                    <Pressable key={d._id} onPress={() => showDay(date)} style={[styles.attRow, styles.divider, selected && { backgroundColor: colors.primarySoft }]}>
                      <Row>
                        <View style={[styles.dayDot, { backgroundColor: h > 4 ? colors.success : colors.warning }]} />
                        <AppText weight="500" style={{ width: 92 }}>
                          {date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                        </AppText>
                        <AppText variant="label" color="textMuted" weight="400" style={{ flex: 1 }}>
                          {timeOf(d.firstActivityAt)} – {timeOf(d.lastActivityAt)}
                        </AppText>
                        <AppText variant="label" weight="600" color={h > 4 ? 'success' : 'warning'}>
                          {h > 4 ? 'Full' : 'Half'}
                        </AppText>
                      </Row>
                    </Pressable>
                  );
                })
              )}
            </Card>
            <AppText variant="caption" color="textSubtle" align="center">
              Present = any activity that day. More than 4 hours between first and last activity = full day. Tap a day to see its activity.
            </AppText>
          </View>
        )}

        {/* Day activity */}
        <View style={{ gap: 16 }} onLayout={(e) => (activityY.current = e.nativeEvent.layout.y)}>
        <SectionHeader title="Activity" />
        <Pager label={dayLabel} onPrev={() => shiftDay(-1)} onNext={() => shiftDay(1)} nextDisabled={sameDay(day, now)} />
        {dayLoading && activities.length === 0 ? (
          <ActivityIndicator color={colors.primary} />
        ) : dayError ? (
          <Card borderColor="danger">
            <Row>
              <Icon name="alert" size={18} color="danger" />
              <AppText color="danger" style={{ flex: 1 }}>
                {dayError}
              </AppText>
              <AppText color="primary" weight="600" onPress={loadDay}>
                Retry
              </AppText>
            </Row>
          </Card>
        ) : activities.length === 0 ? (
          <Card>
            <AppText color="textMuted">No activity on this day.</AppText>
          </Card>
        ) : (
          // Keep the previous day's list on screen (dimmed) while the next one loads, so the page doesn't jump.
          <Card style={{ gap: 0, paddingVertical: 4, opacity: dayLoading ? 0.5 : 1 }}>
            {activities.slice(0, activityShown).map((a, i) => {
              const meta = activityMeta(a);
              const detail = eventDetail(a as unknown as Activity);
              const map = mapUrl(a.location);
              const entity = a.entityId?.companyName || a.entityId?.contactName || a.entityId?.invoiceNumber;
              return (
                <Pressable key={a._id} onPress={() => openEntity(a)} style={[styles.actRow, i > 0 && styles.divider]}>
                  <Row style={{ alignItems: 'flex-start' }}>
                    <View style={[styles.actIcon, { backgroundColor: colors[`${meta.tone}Soft` as ColorName] ?? colors.slateSoft }]}>
                      <Icon name={meta.icon} size={14} color={meta.tone} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText weight="600">{meta.label}</AppText>
                      {entity ? (
                        <AppText variant="label" color="primary" weight="500" numberOfLines={1}>
                          {entity}
                        </AppText>
                      ) : null}
                      {detail ? (
                        <AppText variant="caption" color="textMuted" numberOfLines={2}>
                          {detail}
                        </AppText>
                      ) : null}
                      {map ? (
                        <Pressable onPress={() => Linking.openURL(map)} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                          <Row gap={3}>
                            <Icon name="pin" size={12} color="primary" />
                            <AppText variant="caption" color="primary" weight="600">
                              View location
                            </AppText>
                          </Row>
                        </Pressable>
                      ) : null}
                    </View>
                    <AppText variant="caption" color="textSubtle">
                      {timeOf(a.createdAt)}
                    </AppText>
                  </Row>
                </Pressable>
              );
            })}
            {activities.length > ACTIVITY_PAGE ? (
              <Row gap={16} style={{ justifyContent: 'center', paddingVertical: 12 }}>
                {activityShown < activities.length ? (
                  <AppText variant="label" color="primary" weight="600" onPress={() => setActivityShown((n) => n + ACTIVITY_PAGE)}>
                    Read more ({activities.length - activityShown} more)
                  </AppText>
                ) : null}
                {activityShown > ACTIVITY_PAGE ? (
                  <AppText variant="label" color="textMuted" weight="600" onPress={() => setActivityShown(ACTIVITY_PAGE)}>
                    Show less
                  </AppText>
                ) : null}
              </Row>
            ) : null}
          </Card>
        )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 8, paddingBottom: 40, gap: 16 },
  pager: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 6 },
  pagerBtn: { padding: 6, borderRadius: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.primarySoft },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexBasis: '47%', flexGrow: 1, gap: 4, padding: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  attSummary: { paddingVertical: 10 },
  attRow: { paddingVertical: 10, paddingHorizontal: 4, borderRadius: 8 },
  dayDot: { width: 8, height: 8, borderRadius: 4 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  actRow: { paddingVertical: 12 },
  actIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
