import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { Avatar, Card, Field, FilterChips, Header, Row } from '@/components/ui/layout';
import { PRIORITY_TONE, statusTone } from '@/components/leads/meta';
import { fetchLeads, Lead, LEAD_STATUSES, LeadStatus, statusLabel, titleCase } from '@/lib/leads';
import { useAuth } from '@/store/auth';
import { ColorName, colors } from '@/theme';

const FILTERS: ('All' | LeadStatus)[] = ['All', ...LEAD_STATUSES];
const filterLabel = (f: 'All' | LeadStatus) => (f === 'All' ? 'All' : statusLabel(f));

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** `now` is captured when the list loads (render must stay pure). */
function LeadRow({ lead, now, onPress }: { lead: Lead; now: number; onPress: () => void }) {
  const [fg, bg] = statusTone(lead.status);
  const name = lead.companyName || lead.contactName || 'Unnamed lead';
  const sub = [lead.contactName, titleCase(lead.city)].filter(Boolean).join(' · ');
  const nextAction = formatDate(lead.nextActionDate);
  const overdue = !!lead.nextActionDate && new Date(lead.nextActionDate).getTime() < now;
  const [pfg, pbg]: [ColorName, ColorName] = lead.priority ? PRIORITY_TONE[lead.priority] : ['slate', 'slateSoft'];

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
        <View style={[styles.chip, { backgroundColor: colors[bg] }]}>
          <AppText variant="caption" weight="500" color={fg}>
            {statusLabel(lead.status)}
          </AppText>
        </View>
        {lead.priority ? (
          <View style={[styles.chip, { backgroundColor: colors[pbg] }]}>
            <AppText variant="caption" weight="600" color={pfg}>
              {lead.priority}
            </AppText>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {nextAction ? (
          <>
            <Icon name="clock" size={14} color={overdue ? 'danger' : 'textSubtle'} />
            <AppText variant="caption" color={overdue ? 'danger' : 'textMuted'} weight={overdue ? '600' : '400'}>
              {nextAction}
            </AppText>
          </>
        ) : lead.category ? (
          <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ maxWidth: 140 }}>
            {lead.category}
          </AppText>
        ) : null}
      </Row>
    </Card>
  );
}

export default function LeadsScreen() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'All' | LeadStatus>('All');

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // Reference time for 'overdue', refreshed with each response.
  const [now, setNow] = useState(() => new Date().getTime());
  const requestId = useRef(0);
  // The list is 'loading' until a response for the current search/filter/role has arrived.
  const key = `${isAdmin}|${query}|${status}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== key;

  // Debounce typing so we don't hit the API on every key.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (p: number, mode: 'initial' | 'more' | 'refresh') => {
      const id = ++requestId.current;
      if (mode === 'more') setLoadingMore(true);
      if (mode === 'refresh') setRefreshing(true);
      if (mode !== 'initial') setError('');
      try {
        const res = await fetchLeads({ admin: isAdmin, page: p, search: query, status: status === 'All' ? undefined : status });
        if (id !== requestId.current) return; // a newer search/filter superseded this one
        setLeads((prev) => (p === 1 ? res.data : [...prev, ...res.data]));
        setNow(new Date().getTime());
        setTotal(res.total);
        setPage(p);
        setError('');
      } catch (e) {
        if (id === requestId.current) setError((e as Error).message);
      } finally {
        if (id === requestId.current) {
          setLoadedKey(key);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [isAdmin, query, status, key],
  );

  // (Re)load page 1 whenever search, filter or role changes. State is only set after the await.
  useEffect(() => {
    const id = ++requestId.current;
    fetchLeads({ admin: isAdmin, page: 1, search: query, status: status === 'All' ? undefined : status })
      .then((res) => {
        if (id !== requestId.current) return;
        setLeads(res.data);
        setNow(new Date().getTime());
        setTotal(res.total);
        setPage(1);
        setError('');
      })
      .catch((e: Error) => {
        if (id === requestId.current) setError(e.message);
      })
      .finally(() => {
        if (id === requestId.current) setLoadedKey(key);
      });
  }, [isAdmin, query, status, key]);

  // Coming back from Add / Details: quietly refresh page 1 so new or changed leads show up.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      load(1, 'more');
    }, [load]),
  );

  const hasMore = leads.length < total;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header title={isAdmin ? 'All leads' : 'My leads'} subtitle={loading ? 'Loading…' : `${total} ${total === 1 ? 'lead' : 'leads'}`} />
      <View style={styles.controls}>
        <Field icon="search" placeholder="Search name, company or phone" value={search} onChangeText={setSearch} />
        <FilterChips items={FILTERS.map(filterLabel)} value={filterLabel(status)} onChange={(l) => setStatus(FILTERS.find((f) => filterLabel(f) === l) ?? 'All')} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(l) => l._id}
          renderItem={({ item }) => <LeadRow lead={item} now={now} onPress={() => router.push({ pathname: '/lead/[id]', params: { id: item._id } })} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(1, 'refresh')} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasMore && !loadingMore && !error) load(page + 1, 'more');
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name={error ? 'alert' : 'users'} size={32} color={error ? 'danger' : 'textSubtle'} />
              <AppText color={error ? 'danger' : 'textMuted'} align="center">
                {error || (query || status !== 'All' ? 'No leads match your search.' : 'No leads assigned to you yet.')}
              </AppText>
              {error ? (
                <AppText color="primary" weight="600" onPress={() => load(1, 'initial')}>
                  Try again
                </AppText>
              ) : null}
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
            ) : error && leads.length > 0 ? (
              <AppText color="danger" align="center" onPress={() => load(page + 1, 'more')} style={{ marginVertical: 16 }}>
                {error} Tap to retry.
              </AppText>
            ) : null
          }
        />
      )}

      <Pressable onPress={() => router.push('/lead/new')} style={styles.fab} accessibilityLabel="Add lead">
        <Icon name="plus" size={26} color="surface" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  controls: { paddingHorizontal: 20, gap: 12, paddingBottom: 12 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, elevation: 4, shadowColor: '#0F172A', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  list: { paddingHorizontal: 20, paddingBottom: 96, gap: 12, flexGrow: 1 },
  call: { padding: 9, borderRadius: 10, backgroundColor: colors.successSoft },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
});
