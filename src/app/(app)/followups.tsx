import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { Avatar, Card, FilterChips, Header, Row } from '@/components/ui/layout';
import { statusTone } from '@/components/leads/meta';
import { fetchFollowUps, Lead, statusLabel, titleCase } from '@/lib/leads';
import { useAuth } from '@/store/auth';
import { ColorName, colors } from '@/theme';

type Group = { key: 'overdue' | 'today' | 'upcoming'; title: string; tone: ColorName; leads: Lead[] };

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Splits leads into Overdue (before today), Today and Upcoming, each sorted by date. */
function groupFollowUps(leads: Lead[]): Group[] {
  const today = startOfToday();
  const tomorrow = today + 24 * 60 * 60 * 1000;
  const at = (l: Lead) => new Date(l.nextActionDate as string).getTime();
  const sorted = [...leads].filter((l) => !isNaN(at(l))).sort((a, b) => at(a) - at(b));
  return [
    { key: 'overdue', title: 'Overdue', tone: 'danger', leads: sorted.filter((l) => at(l) < today) },
    { key: 'today', title: 'Today', tone: 'warning', leads: sorted.filter((l) => at(l) >= today && at(l) < tomorrow) },
    { key: 'upcoming', title: 'Upcoming', tone: 'primary', leads: sorted.filter((l) => at(l) >= tomorrow) },
  ];
}

function whenLabel(iso: string, withTime: boolean) {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (!withTime) return date;
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
}

function FollowUpRow({ lead, tone, onPress }: { lead: Lead; tone: ColorName; onPress: () => void }) {
  const [fg, bg] = statusTone(lead.status);
  const name = lead.companyName || lead.contactName || 'Unnamed lead';
  const sub = [lead.contactName, titleCase(lead.city)].filter(Boolean).join(' · ');
  return (
    <Card style={{ gap: 10 }} onPress={onPress}>
      <Row>
        <Avatar name={name} size={40} />
        <View style={{ flex: 1 }}>
          <AppText variant="section" numberOfLines={1}>
            {name}
          </AppText>
          {sub ? (
            <AppText variant="label" color="textMuted" weight="400" numberOfLines={1}>
              {sub}
            </AppText>
          ) : null}
        </View>
        {lead.mobile ? (
          <Pressable onPress={() => Linking.openURL(`tel:${lead.mobile}`)} style={styles.call} hitSlop={8}>
            <Icon name="phone" size={16} color="success" />
          </Pressable>
        ) : null}
      </Row>
      <Row gap={8}>
        <Icon name="clock" size={14} color={tone} />
        <AppText variant="caption" weight="600" color={tone}>
          {whenLabel(lead.nextActionDate as string, true)}
        </AppText>
        <View style={{ flex: 1 }} />
        <View style={[styles.chip, { backgroundColor: colors[bg] }]}>
          <AppText variant="caption" weight="500" color={fg}>
            {statusLabel(lead.status)}
          </AppText>
        </View>
      </Row>
      {lead.nextActionNote ? (
        <AppText variant="label" color="textMuted" weight="400" numberOfLines={2}>
          {lead.nextActionNote}
        </AppText>
      ) : null}
    </Card>
  );
}

const FILTERS = ['All', 'Overdue', 'Today', 'Upcoming'] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_KEY: Record<Exclude<Filter, 'All'>, Group['key']> = { Overdue: 'overdue', Today: 'today', Upcoming: 'upcoming' };
/** Route param `?filter=overdue|today|upcoming` → chip. */
const fromParam = (p?: string): Filter => FILTERS.find((f) => f.toLowerCase() === p?.toLowerCase()) ?? 'All';

export default function FollowUps() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<Filter>(() => fromParam(params.filter));
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      try {
        setLeads(await fetchFollowUps(isAdmin));
        setError('');
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoaded(true);
        setRefreshing(false);
      }
    },
    [isAdmin],
  );

  // Refresh every time the screen is focused, so a follow-up scheduled on Lead Details shows up on return.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const allGroups = groupFollowUps(leads);
  const groups = filter === 'All' ? allGroups : allGroups.filter((g) => g.key === FILTER_KEY[filter]);
  const count = groups.reduce((n, g) => n + g.leads.length, 0);
  const subtitle = !loaded ? 'Loading…' : `${count} ${count === 1 ? 'follow-up' : 'follow-ups'}`;
  const chipLabel = (f: Filter) => (f === 'All' ? 'All' : `${f} · ${allGroups.find((g) => g.key === FILTER_KEY[f])?.leads.length ?? 0}`);
  const emptyText =
    filter === 'All' ? 'No follow-ups scheduled. Schedule a follow-up on a lead to see it here.' : filter === 'Overdue' ? 'Nothing overdue.' : filter === 'Today' ? 'Nothing due today.' : 'No upcoming follow-ups.';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header title="Follow-ups" subtitle={subtitle} back />
      <View style={styles.controls}>
        <FilterChips items={FILTERS.map(chipLabel)} value={chipLabel(filter)} onChange={(l) => setFilter(FILTERS.find((f) => chipLabel(f) === l) ?? 'All')} />
      </View>
      {!loaded ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}>
          {count === 0 ? (
            <View style={styles.empty}>
              <Icon name={error ? 'alert' : 'clock'} size={32} color={error ? 'danger' : 'textSubtle'} />
              <AppText color={error ? 'danger' : 'textMuted'} align="center">
                {error || emptyText}
              </AppText>
              {error ? (
                <AppText color="primary" weight="600" onPress={() => load()}>
                  Try again
                </AppText>
              ) : null}
            </View>
          ) : (
            groups
              .filter((g) => g.leads.length > 0)
              .map((g) => (
                <View key={g.key} style={{ gap: 12 }}>
                  <AppText variant="section" color={g.tone}>
                    {g.title} · {g.leads.length}
                  </AppText>
                  {g.leads.map((l) => (
                    <FollowUpRow key={l._id} lead={l} tone={g.tone} onPress={() => router.push({ pathname: '/lead/[id]', params: { id: l._id } })} />
                  ))}
                </View>
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
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 20, flexGrow: 1 },
  call: { padding: 9, borderRadius: 10, backgroundColor: colors.successSoft },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
});
