import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { Card, FilterChips, Header, Row } from '@/components/ui/layout';
import { rupees } from '@/lib/customers';
import {
  fetchAllProposals,
  proposalAmount,
  proposalFor,
  proposalLeadId,
  ProposalRow,
  proposalSender,
  ProposalStatus,
  PROPOSAL_STATUS_TONE,
} from '@/lib/proposals';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

const FILTERS = ['All', 'Generated', 'Sent', 'Accepted', 'Rejected'] as const;
type Filter = (typeof FILTERS)[number];

const dateText = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function ProposalItem({ p, showSender, onPress }: { p: ProposalRow; showSender: boolean; onPress?: () => void }) {
  const [fg, bg] = PROPOSAL_STATUS_TONE[p.status] ?? ['slate', 'slateSoft'];
  const amount = proposalAmount(p);
  const sender = showSender ? proposalSender(p) : '';
  return (
    <Card style={{ gap: 8 }} onPress={onPress}>
      <Row>
        <View style={{ flex: 1 }}>
          <AppText variant="section" numberOfLines={1}>
            {proposalFor(p) || `Proposal #${p._id.slice(-6).toUpperCase()}`}
          </AppText>
          {p.coverType ? (
            <AppText variant="label" color="textMuted" weight="400" numberOfLines={2}>
              {p.coverType}
            </AppText>
          ) : null}
        </View>
        <View style={[styles.chip, { backgroundColor: colors[bg] }]}>
          <AppText variant="caption" weight="600" color={fg}>
            {p.status}
          </AppText>
        </View>
      </Row>
      <Row gap={14}>
        {amount !== null ? (
          <AppText variant="caption" weight="600">
            {rupees(amount)}
          </AppText>
        ) : null}
        <AppText variant="caption" color="textSubtle">
          {dateText(p.createdAt)}
        </AppText>
        <Row gap={5}>
          <Icon name="eye" size={14} color="textSubtle" />
          <AppText variant="caption" color="textMuted">
            {p.viewCount} {p.viewCount === 1 ? 'view' : 'views'}
          </AppText>
        </Row>
        {sender ? (
          <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
            {sender}
          </AppText>
        ) : null}
      </Row>
    </Card>
  );
}

// My proposals (Admin: all proposals), newest first, 20 at a time. Tapping one opens its lead's proposals screen.
export default function ProposalsScreen() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('All');
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(
    async (nextPage: number, mode: 'initial' | 'refresh' | 'more') => {
      const id = ++requestId.current;
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);
      setError('');
      try {
        const status = filter === 'All' ? undefined : (filter.toUpperCase() as ProposalStatus);
        const res = await fetchAllProposals({ page: nextPage, status });
        if (id !== requestId.current) return; // a newer filter superseded this one
        setRows((prev) => (nextPage === 1 ? res.data : [...prev, ...res.data]));
        setTotal(res.meta.total);
        setPage(res.meta.page);
        setTotalPages(res.meta.totalPages);
      } catch (e) {
        if (id === requestId.current) setError((e as Error).message);
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [filter],
  );

  useFocusEffect(
    useCallback(() => {
      load(1, 'initial');
    }, [load]),
  );

  const changeFilter = (f: Filter) => {
    setFilter(f);
    setLoading(true);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header
        title={isAdmin ? 'All proposals' : 'My proposals'}
        subtitle={loading ? 'Loading…' : `${total} ${total === 1 ? 'proposal' : 'proposals'}`}
        back
      />
      <View style={styles.controls}>
        <FilterChips items={[...FILTERS]} value={filter} onChange={(v) => changeFilter(v as Filter)} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(p) => p._id}
          renderItem={({ item }) => {
            const leadId = proposalLeadId(item);
            return (
              <ProposalItem
                p={item}
                showSender={isAdmin}
                onPress={leadId ? () => router.push({ pathname: '/lead/proposals/[id]', params: { id: leadId } }) : undefined}
              />
            );
          }}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(1, 'refresh')} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!loadingMore && !error && page < totalPages) load(page + 1, 'more');
          }}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} /> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name={error ? 'alert' : 'file'} size={32} color={error ? 'danger' : 'textSubtle'} />
              <AppText color={error ? 'danger' : 'textMuted'} align="center">
                {error || (filter === 'All' ? 'No proposals yet. Create one from a lead.' : 'No proposals with this status.')}
              </AppText>
              {error ? (
                <AppText color="primary" weight="600" onPress={() => load(1, 'initial')}>
                  Try again
                </AppText>
              ) : null}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  controls: { paddingHorizontal: 20, paddingBottom: 12 },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 12, flexGrow: 1 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
});
