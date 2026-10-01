import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon, IconName } from '@/components/ui/Icon';
import { Card, FilterChips, GradientCard, IconBadge, Row, SectionHeader } from '@/components/ui/layout';
import { rupees } from '@/lib/customers';
import { countAllLeads, fetchFollowUps, Lead } from '@/lib/leads';
import { DashboardRow, fetchDashboardRows, fetchMonthRows, Range, RANGES, rangeDates } from '@/lib/reporting';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

type Tone = 'primary' | 'purple' | 'success' | 'warning' | 'danger';

const startOfToday = () => new Date().setHours(0, 0, 0, 0);
const at = (l: Lead) => new Date(l.nextActionDate as string).getTime();

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function daysLeftInMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
}

const assigneeName = (l: Lead) => (typeof l.assignedTo === 'object' && l.assignedTo?.fullName) || 'Unassigned';
const sum = (rows: DashboardRow[], k: keyof DashboardRow) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);

/** Short clock time ("9:05 AM"), or a dash when there was no activity. */
const clock = (iso: string | null) => {
  if (!iso || iso === 'N/A') return '–';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '–' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

// Team performance table: short header label and width of each column after the name.
const COLS = [
  { key: 'att', label: 'Att', w: 58 },
  { key: 'leads', label: 'Leads', w: 58 },
  { key: 'props', label: 'Prop', w: 56 },
  { key: 'meets', label: 'Meet', w: 56 },
  { key: 'fups', label: 'F-Up', w: 56 },
  { key: 'deals', label: 'Deals', w: 58 },
  { key: 'first', label: 'First', w: 84 },
  { key: 'last', label: 'Last', w: 84 },
] as const;
const NAME_W = 140;
const cells = (r: DashboardRow): Record<(typeof COLS)[number]['key'], string> => ({
  att: r.attendanceText || '0',
  leads: String(r.totalLeads),
  props: String(r.proposals),
  meets: String(r.meetings),
  fups: String(r.followUps),
  deals: String(r.dealsClosed),
  first: clock(r.firstActivity),
  last: clock(r.lastActivity),
});

type Data = {
  inMeeting: number;
  followUps: Lead[];
  /** Activity for the selected period. */
  period: DashboardRow[];
  /** Carries the monthly targets shown in the target card. */
  month: DashboardRow[];
};


/** Icon on the left, count and label on the right. */
function Stat({ label, value, icon, tone, onPress }: { label: string; value: number | string; icon: IconName; tone: Tone; onPress?: () => void }) {
  return (
    <Card style={styles.stat} onPress={onPress}>
      <Row gap={12}>
        <IconBadge icon={icon} tone={tone} />
        <View style={{ flex: 1 }}>
          <AppText variant="heading" numberOfLines={1}>
            {value}
          </AppText>
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {label}
          </AppText>
        </View>
      </Row>
    </Card>
  );
}

export default function Dashboard() {
  const { session } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Partial<Data>>({});
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [range, setRange] = useState<Range>('Today');
  const [periodLoading, setPeriodLoading] = useState(false);
  const rangeRef = useRef(range);

  const load = useCallback(async (r: Range, refresh = false) => {
    if (refresh) setRefreshing(true);
    const { start, end, targetMonth } = rangeDates(r);
    // "This month" and "Last month" periods already carry their month's targets; rolling ranges use this month.
    const needMonth = r === 'Today' || r === 'Last 7 days' || r === 'Last 30 days';
    // Each block loads on its own, so one failing API doesn't blank the whole screen.
    const [meeting, followUps, period, month] = await Promise.allSettled([
      countAllLeads('MEETING'),
      fetchFollowUps(true),
      fetchDashboardRows(start, end),
      needMonth ? fetchMonthRows() : Promise.resolve(null),
    ]);
    if (rangeRef.current !== r) return; // the user picked another period meanwhile
    const next: Partial<Data> = {};
    if (meeting.status === 'fulfilled') next.inMeeting = meeting.value;
    if (followUps.status === 'fulfilled') next.followUps = followUps.value;
    if (period.status === 'fulfilled') {
      next.period = period.value;
      if (targetMonth === 'last' || !needMonth) next.month = period.value;
    }
    if (month.status === 'fulfilled' && month.value) next.month = month.value;
    setData((prev) => ({ ...prev, ...next }));
    const failed = [meeting, followUps, period, month].find((x) => x.status === 'rejected') as PromiseRejectedResult | undefined;
    setError(failed ? (failed.reason as Error).message : '');
    setLoaded(true);
    setRefreshing(false);
    setPeriodLoading(false);
  }, []);

  const changeRange = (r: Range) => {
    if (r === range) return;
    rangeRef.current = r;
    setRange(r);
    setPeriodLoading(true);
    load(r);
  };

  // Refresh whenever the tab comes back into view.
  useFocusEffect(
    useCallback(() => {
      load(rangeRef.current);
    }, [load]),
  );

  const name = session?.name ?? '';
  const todayStart = startOfToday();
  const followUps = [...(data.followUps ?? [])].sort((a, b) => at(a) - at(b));
  const overdue = followUps.filter((l) => at(l) < todayStart);

  // Team = active non-admin employees.
  const team = (data.month ?? []).filter((r) => r.role !== 'Admin' && r.status === 'Active');
  const periodRows = (data.period ?? []).filter((r) => r.role !== 'Admin');
  // Active people for the table (Admins included), most deals first.
  const tableRows = (data.period ?? [])
    .filter((r) => r.status === 'Active')
    .sort((a, b) => b.dealsClosed - a.dealsClosed || b.totalLeads - a.totalLeads || a.employeeName.localeCompare(b.employeeName));
  const lastMonth = range === 'Last month';
  const targetMonthName = (lastMonth ? new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1) : new Date()).toLocaleDateString(undefined, { month: 'long' });
  const target = sum(team, 'targetRevenue');
  const achieved = sum(team, 'achievedAmount');
  const collected = sum(team, 'collectionAmount');
  const pct = target > 0 ? achieved / target : 0;
  const daysLeft = daysLeftInMonth();
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(range, true)} tintColor={colors.primary} />}>
        {/* Greeting */}
        <Row>
          <View style={{ flex: 1 }}>
            <AppText variant="label" color="textMuted" weight="400">
              {greeting()},
            </AppText>
            <AppText variant="heading" numberOfLines={1}>
              {name.split(' ')[0]}
            </AppText>
          </View>
          <View style={styles.rolePill}>
            <AppText variant="caption" weight="600" color="primary">
              Admin
            </AppText>
          </View>
        </Row>

        {/* Period for the stats, target card and team numbers. */}
        <FilterChips items={[...RANGES]} value={range} onChange={(v) => changeRange(v as Range)} />

        {!loaded ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : (
          <>
            {error ? (
              <Card borderColor="danger">
                <Row>
                  <Icon name="alert" size={18} color="danger" />
                  <AppText color="danger" style={{ flex: 1 }}>
                    {error}
                  </AppText>
                  <AppText color="primary" weight="600" onPress={() => load(range, true)}>
                    Retry
                  </AppText>
                </Row>
              </Card>
            ) : null}

            {/* Team target: sum of this month's targets (web → Team → Add Target). */}
            <GradientCard>
              <AppText variant="label" color="surface" weight="500" style={{ opacity: 0.9 }}>
                Team target · {targetMonthName}
              </AppText>
              {target > 0 ? (
                <>
                  <AppText color="surface" style={styles.amount}>
                    {rupees(achieved)}
                    <AppText variant="label" color="surface" weight="400">
                      {'  '}of {rupees(target)}
                    </AppText>
                  </AppText>
                  <View style={styles.trackOnGradient}>
                    <View style={[styles.trackFill, { width: `${Math.max(2, Math.min(100, pct * 100))}%` }]} />
                  </View>
                  <AppText variant="caption" color="surface" style={{ opacity: 0.9 }}>
                    {Math.round(pct * 100)}% achieved · {rupees(collected)} collected
                    {lastMonth ? '' : ` · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}
                  </AppText>
                </>
              ) : (
                <AppText color="surface">No targets set for {targetMonthName}. Set them on the web in Team → Add Target.</AppText>
              )}
            </GradientCard>

            {/* Numbers for the selected period */}
            <View style={{ gap: 10, opacity: periodLoading ? 0.5 : 1 }}>
              <View style={styles.grid}>
                <Stat label="Leads" value={data.period ? sum(periodRows, 'totalLeads') : '–'} icon="users" tone="primary" onPress={() => router.push('/leads')} />
                <Stat label="Proposals" value={data.period ? sum(periodRows, 'proposals') : '–'} icon="file" tone="purple" onPress={() => router.push('/leads')} />
              </View>
              <View style={styles.grid}>
                <Stat label="In meeting" value={data.inMeeting ?? '–'} icon="calendar" tone="warning" onPress={() => router.push('/leads')} />
                <Stat label="Deals closed" value={data.period ? sum(periodRows, 'dealsClosed') : '–'} icon="check" tone="success" onPress={() => router.push('/leads')} />
              </View>
            </View>

            {/* Team performance for the selected period: scrolls up/down inside the card (and sideways on a narrow phone) */}
            <SectionHeader title={`Team performance · ${tableRows.length}`} />
            {tableRows.length === 0 ? (
              <Card>
                <AppText color="textMuted">No active employees.</AppText>
              </Card>
            ) : (
              <Card style={styles.tableCard}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled bounces={false}>
                  <View>
                    <View style={[styles.tr, styles.thead]}>
                      <AppText variant="caption" weight="700" color="textMuted" style={{ width: NAME_W }}>
                        Employee
                      </AppText>
                      {COLS.map((c) => (
                        <AppText key={c.key} variant="caption" weight="700" color="textMuted" align="center" style={{ width: c.w }}>
                          {c.label}
                        </AppText>
                      ))}
                    </View>
                    <ScrollView style={styles.tbody} nestedScrollEnabled showsVerticalScrollIndicator={false} overScrollMode="never">
                      {tableRows.map((r, i) => {
                        const c = cells(r);
                        return (
                          <View key={r.employeeId} style={[styles.tr, i > 0 && styles.divider]}>
                            <Row gap={8} style={{ width: NAME_W }}>
                              <AppText weight="600" numberOfLines={1} style={{ flex: 1 }}>
                                {r.employeeName}{r.role === 'Admin' ? ' (Admin)' : ''}
                              </AppText>
                            </Row>
                            {COLS.map((col) => (
                              <AppText key={col.key} variant="body" weight={col.key === 'deals' ? '700' : '400'} align="center" style={{ width: col.w }}>
                                {c[col.key]}
                              </AppText>
                            ))}
                          </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                </ScrollView>
              </Card>
            )}

            {/* Overdue follow-ups across the team (admin only needs the exceptions) */}
            <SectionHeader
              title={`Overdue follow-ups · ${overdue.length}`}
              link={overdue.length ? 'See all' : undefined}
              onPress={() => router.push({ pathname: '/followups', params: { filter: 'overdue' } })}
            />
            {overdue.length === 0 ? (
              <Card>
                <Row>
                  <Icon name="check" size={18} color="success" />
                  <AppText color="textMuted">No overdue follow-ups.</AppText>
                </Row>
              </Card>
            ) : null}
            {overdue.slice(0, 3).map((l) => (
              <Card key={l._id} onPress={() => router.push({ pathname: '/lead/[id]', params: { id: l._id } })}>
                <Row>
                  <IconBadge icon="clock" tone="danger" />
                  <View style={{ flex: 1 }}>
                    <AppText variant="section" numberOfLines={1}>
                      {l.companyName || l.contactName || 'Unnamed lead'}
                    </AppText>
                    <AppText variant="label" color="textMuted" weight="400" numberOfLines={1}>
                      {assigneeName(l)} · {new Date(at(l)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </AppText>
                  </View>
                  <View style={[styles.badge, { backgroundColor: colors.dangerSoft }]}>
                    <AppText variant="caption" weight="600" color="danger">
                      Overdue
                    </AppText>
                  </View>
                </Row>
              </Card>
            ))}

          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 12, paddingBottom: 32, gap: 16 },
  rolePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.primarySoft },
  amount: { fontSize: 30, fontWeight: '700', lineHeight: 38 },
  trackOnGradient: { height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 4, backgroundColor: colors.surface },
  grid: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, gap: 2, padding: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tableCard: { padding: 0, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14 },
  thead: { backgroundColor: colors.bg, paddingVertical: 10 },
  tbody: { maxHeight: 420 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
});
