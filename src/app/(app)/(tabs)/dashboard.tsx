import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon, IconName } from '@/components/ui/Icon';
import { Avatar, Card, FilterChips, GradientCard, IconBadge, Row, SectionHeader, Track } from '@/components/ui/layout';
import { STATUS_TONE } from '@/components/leads/meta';
import { rupees } from '@/lib/customers';
import { countAllLeads, countPoolLeads, fetchFollowUps, Lead, LeadStatus, statusLabel } from '@/lib/leads';
import { DashboardRow, fetchDashboardRows, fetchMonthRows, Range, RANGES, rangeDates, ROLE_LABEL } from '@/lib/reporting';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

type Tone = 'primary' | 'purple' | 'success' | 'warning' | 'danger';

// Open pipeline, in lifecycle order (backend/docs/05-LEAD-LIFECYCLE.md).
const FUNNEL: LeadStatus[] = ['FRESH', 'CONTACTED', 'MEETING', 'FOLLOW_UP', 'PROPOSAL', 'DEAL_CLOSED'];

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
const activeToday = (r: DashboardRow) => !!r.firstActivity && r.firstActivity !== 'N/A';

type Data = {
  total: number;
  pool: number;
  funnel: Record<string, number>;
  followUps: Lead[];
  /** Activity for the selected period. */
  period: DashboardRow[];
  /** Carries the monthly targets shown in the target card. */
  month: DashboardRow[];
  today: DashboardRow[];
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

/** One of four tiles in the Today card: small icon, count, label. */
function Metric({ label, value, icon, tone }: { label: string; value: number; icon: IconName; tone: Tone }) {
  return (
    <View style={styles.metric}>
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

export default function Dashboard() {
  const { session } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Partial<Data>>({});
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [range, setRange] = useState<Range>('This month');
  const [periodLoading, setPeriodLoading] = useState(false);
  const rangeRef = useRef(range);

  const load = useCallback(async (r: Range, refresh = false) => {
    if (refresh) setRefreshing(true);
    const now = new Date();
    const { start, end, targetMonth } = rangeDates(r);
    // "This month" and "Last month" periods already carry their month's targets; rolling ranges use this month.
    const needMonth = r === 'Last 7 days' || r === 'Last 30 days';
    // Each block loads on its own, so one failing API doesn't blank the whole screen.
    const [counts, followUps, period, month, today] = await Promise.allSettled([
      Promise.all([countAllLeads(), countPoolLeads(), ...FUNNEL.map((s) => countAllLeads(s))]),
      fetchFollowUps(true),
      fetchDashboardRows(start, end),
      needMonth ? fetchMonthRows() : Promise.resolve(null),
      fetchDashboardRows(now, now),
    ]);
    if (rangeRef.current !== r) return; // the user picked another period meanwhile
    const next: Partial<Data> = {};
    if (counts.status === 'fulfilled') {
      const [total, pool, ...byStatus] = counts.value;
      Object.assign(next, { total, pool, funnel: Object.fromEntries(FUNNEL.map((s, i) => [s, byStatus[i]])) });
    }
    if (followUps.status === 'fulfilled') next.followUps = followUps.value;
    if (period.status === 'fulfilled') {
      next.period = period.value;
      if (targetMonth === 'last' || !needMonth) next.month = period.value;
    }
    if (month.status === 'fulfilled' && month.value) next.month = month.value;
    if (today.status === 'fulfilled') next.today = today.value;
    setData((prev) => ({ ...prev, ...next }));
    const failed = [counts, followUps, period, month, today].find((x) => x.status === 'rejected') as PromiseRejectedResult | undefined;
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
  const todayRows = (data.today ?? []).filter((r) => r.role !== 'Admin');
  const periodRows = (data.period ?? []).filter((r) => r.role !== 'Admin');
  const periodById = new Map(periodRows.map((r) => [r.employeeId, r]));
  const lastMonth = range === 'Last month';
  const targetMonthName = (lastMonth ? new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1) : new Date()).toLocaleDateString(undefined, { month: 'long' });
  const target = sum(team, 'targetRevenue');
  const achieved = sum(team, 'achievedAmount');
  const collected = sum(team, 'collectionAmount');
  const pct = target > 0 ? achieved / target : 0;
  const daysLeft = daysLeftInMonth();
  const funnelMax = Math.max(1, ...FUNNEL.map((s) => data.funnel?.[s] ?? 0));
  const workingToday = todayRows.filter((r) => r.status === 'Active' && activeToday(r)).length;
  const teamSize = todayRows.filter((r) => r.status === 'Active').length;
  const ranked = [...team].sort((a, b) => (b.targetRevenue ? b.achievedAmount / b.targetRevenue : 0) - (a.targetRevenue ? a.achievedAmount / a.targetRevenue : 0));
  const todayById = new Map(todayRows.map((r) => [r.employeeId, r]));

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(range, true)} tintColor={colors.primary} />}>
        {/* Greeting */}
        <Row>
          <Avatar name={name || '?'} size={44} />
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
                <Stat label="In meeting" value={data.funnel?.MEETING ?? '–'} icon="calendar" tone="warning" onPress={() => router.push('/leads')} />
                <Stat label="Deals closed" value={data.period ? sum(periodRows, 'dealsClosed') : '–'} icon="check" tone="success" onPress={() => router.push('/leads')} />
              </View>
            </View>

            {/* Follow-ups across the team */}
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

            {/* Pipeline by status (assigned leads) */}
            <SectionHeader title="Pipeline" link={data.pool !== undefined ? `${data.pool} in pool` : undefined} onPress={() => router.push('/leads')} />
            <Card style={{ gap: 12 }}>
              {FUNNEL.map((s) => {
                const n = data.funnel?.[s] ?? 0;
                return (
                  <View key={s} style={{ gap: 6 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <AppText variant="label" color="textMuted">
                        {statusLabel(s)}
                      </AppText>
                      <AppText variant="label" weight="600">
                        {n}
                      </AppText>
                    </Row>
                    <Track pct={n / funnelMax} tone={STATUS_TONE[s][0]} />
                  </View>
                );
              })}
            </Card>

            {/* Today's activity */}
            <SectionHeader title="Today" />
            <Card style={{ gap: 14 }}>
              {/* Who has logged activity today, out of the active team */}
              <View style={{ gap: 8 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row gap={8}>
                    <Icon name="users" size={16} color="primary" />
                    <AppText weight="600">Working today</AppText>
                  </Row>
                  <AppText weight="600">
                    {workingToday}
                    <AppText color="textMuted" weight="400">
                      {' '}
                      / {teamSize}
                    </AppText>
                  </AppText>
                </Row>
                <Track pct={teamSize ? workingToday / teamSize : 0} tone="success" />
              </View>
              <View style={styles.metrics}>
                <Metric label="Leads taken" value={sum(todayRows, 'totalLeads')} icon="users" tone="primary" />
                <Metric label="Follow-ups set" value={sum(todayRows, 'followUps')} icon="clock" tone="warning" />
                <Metric label="Proposals sent" value={sum(todayRows, 'proposals')} icon="file" tone="purple" />
                <Metric label="Deals closed" value={sum(todayRows, 'dealsClosed')} icon="check" tone="success" />
              </View>
            </Card>

            {/* Team, best target progress first */}
            <SectionHeader title={`Team · ${team.length}`} />
            {team.length === 0 ? (
              <Card>
                <AppText color="textMuted">No active employees.</AppText>
              </Card>
            ) : (
              <Card style={{ gap: 0, paddingVertical: 4 }}>
                {ranked.map((r, i) => {
                  const p = r.targetRevenue > 0 ? r.achievedAmount / r.targetRevenue : 0;
                  const t = todayById.get(r.employeeId);
                  const on = t ? activeToday(t) : false;
                  const pr = periodById.get(r.employeeId);
                  const deals = pr?.dealsClosed ?? 0;
                  return (
                    <View key={r.employeeId} style={[styles.member, i > 0 && styles.divider]}>
                      <Row>
                        <View>
                          <Avatar name={r.employeeName} size={36} />
                          <View style={[styles.dot, { backgroundColor: on ? colors.success : colors.textSubtle }]} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppText weight="600" numberOfLines={1}>
                            {r.employeeName}
                          </AppText>
                          <AppText variant="caption" color="textMuted" numberOfLines={1}>
                            {ROLE_LABEL[r.role] ?? r.role} · {deals} {deals === 1 ? 'deal' : 'deals'} · {pr?.proposals ?? 0} sent
                          </AppText>
                        </View>
                        <AppText variant="label" weight="600" color={r.targetRevenue > 0 ? 'text' : 'textSubtle'}>
                          {r.targetRevenue > 0 ? `${Math.round(p * 100)}%` : 'No target'}
                        </AppText>
                      </Row>
                      {r.targetRevenue > 0 ? (
                        <View style={{ gap: 4, marginTop: 8 }}>
                          <Track pct={p} tone={p >= 1 ? 'success' : 'primary'} />
                          <AppText variant="caption" color="textMuted">
                            {rupees(r.achievedAmount)} of {rupees(r.targetRevenue)}
                          </AppText>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </Card>
            )}
            <AppText variant="caption" color="textSubtle" align="center">
              Green dot = active today. Deals and proposals: {range.toLowerCase()}. Targets: {targetMonthName}.
            </AppText>
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
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexBasis: '47%', flexGrow: 1, gap: 4, padding: 10, borderRadius: 12, backgroundColor: colors.bg },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  member: { paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  dot: { position: 'absolute', right: 0, bottom: 0, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.surface },
});
