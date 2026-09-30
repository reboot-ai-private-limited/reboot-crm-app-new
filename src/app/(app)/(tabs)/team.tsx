import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { Avatar, Card, Header, Row, Segmented } from '@/components/ui/layout';
import { DashboardRow, fetchMonthRows, ROLE_LABEL } from '@/lib/reporting';
import { ColorName, colors } from '@/theme';

const TABS = ['All', 'Advisors', 'Field'] as const;
type Tab = (typeof TABS)[number];
const TAB_ROLE: Record<Tab, DashboardRow['role'] | null> = { All: null, Advisors: 'BusinessAdvisor', Field: 'FieldSales' };

/** Green from 75%, amber from 50%, red below. */
function progressTone(pct: number): ColorName {
  if (pct >= 0.75) return 'success';
  if (pct >= 0.5) return 'warning';
  return 'danger';
}

const pctOf = (r: DashboardRow) => (r.targetRevenue > 0 ? r.achievedAmount / r.targetRevenue : 0);

function MemberCard({ row, onPress }: { row: DashboardRow; onPress: () => void }) {
  const active = row.status === 'Active';
  const hasTarget = row.targetRevenue > 0;
  const pct = pctOf(row);
  const tone = progressTone(pct);
  return (
    <Card style={{ gap: 12 }} onPress={onPress}>
      <Row>
        <Avatar name={row.employeeName} size={42} />
        <View style={{ flex: 1 }}>
          <AppText variant="section" numberOfLines={1}>
            {row.employeeName}
          </AppText>
          <AppText variant="label" color="textMuted" weight="400">
            {ROLE_LABEL[row.role] ?? row.role}
          </AppText>
        </View>
        <View style={[styles.pill, { backgroundColor: colors[active ? 'successSoft' : 'slateSoft'] }]}>
          <AppText variant="caption" weight="600" color={active ? 'success' : 'slate'}>
            {active ? 'Active' : 'Inactive'}
          </AppText>
        </View>
      </Row>

      <View style={{ gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText variant="label" color="textMuted" weight="400">
            Target achieved
          </AppText>
          <AppText variant="label" weight="700" color={hasTarget ? tone : 'textSubtle'}>
            {hasTarget ? `${Math.round(pct * 100)}%` : 'No target'}
          </AppText>
        </Row>
        <View style={styles.track}>
          {hasTarget ? <View style={[styles.fill, { width: `${Math.max(2, Math.min(100, pct * 100))}%`, backgroundColor: colors[tone] }]} /> : null}
        </View>
      </View>

      <AppText variant="label" color="textMuted" weight="400">
        {row.totalLeads} {row.totalLeads === 1 ? 'lead' : 'leads'}
        {'   '}
        {row.dealsClosed} {row.dealsClosed === 1 ? 'deal' : 'deals'}
      </AppText>
    </Card>
  );
}

// Admin: every employee with this month's target progress. Tap for their details.
export default function Team() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('All');
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      setRows(await fetchMonthRows());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const staff = rows.filter((r) => r.role !== 'Admin');
  const role = TAB_ROLE[tab];
  // Active first, then best target progress.
  const shown = staff
    .filter((r) => !role || r.role === role)
    .sort((a, b) => (a.status === b.status ? pctOf(b) - pctOf(a) : a.status === 'Active' ? -1 : 1));
  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' });

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header title="Team" subtitle={loaded ? `${staff.length} ${staff.length === 1 ? 'employee' : 'employees'} · ${monthName}` : 'Loading…'} />
      <View style={styles.controls}>
        <Segmented items={[...TABS]} value={tab} onChange={(v) => setTab(v as Tab)} />
      </View>

      {!loaded ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}>
          {error ? (
            <Card borderColor="danger">
              <Row>
                <Icon name="alert" size={18} color="danger" />
                <AppText color="danger" style={{ flex: 1 }}>
                  {error}
                </AppText>
                <AppText color="primary" weight="600" onPress={() => load(true)}>
                  Retry
                </AppText>
              </Row>
            </Card>
          ) : shown.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="users" size={32} color="textSubtle" />
              <AppText color="textMuted" align="center">
                No employees here.
              </AppText>
            </View>
          ) : (
            shown.map((r) => (
              <MemberCard
                key={r.employeeId}
                row={r}
                onPress={() => router.push({ pathname: '/team/[id]', params: { id: r.employeeId, name: r.employeeName, role: r.role, mobile: r.mobile, status: r.status } })}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  controls: { paddingHorizontal: 20, paddingBottom: 12 },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 12, flexGrow: 1 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  track: { height: 6, borderRadius: 4, backgroundColor: colors.slateSoft, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
});
