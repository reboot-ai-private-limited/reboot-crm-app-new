import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Card, FilterChips, Header, IconBadge, IconButton, Row } from '@/components/ui/layout';
import {
  AppNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationStyle,
  setUnreadCount,
  timeAgo,
} from '@/lib/notifications';
import { colors } from '@/theme';

const FILTERS = ['All', 'Unread'];

function NotificationRow({ item, onPress }: { item: AppNotification; onPress: () => void }) {
  const style = notificationStyle[item.type] ?? { icon: 'bell' as const, tone: 'slate' as const };
  const unread = !item.readAt;
  return (
    <Card style={{ ...styles.row, ...(unread ? styles.rowUnread : null) }} onPress={onPress}>
      <IconBadge icon={style.icon} tone={style.tone} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight={unread ? '600' : '400'} numberOfLines={2}>
          {item.title}
        </AppText>
        {item.body ? (
          <AppText variant="label" color="textMuted" weight="400" numberOfLines={2}>
            {item.body}
          </AppText>
        ) : null}
        <Row gap={6} style={{ marginTop: 2 }}>
          <AppText variant="caption" color="textSubtle">
            {timeAgo(item.createdAt)}
          </AppText>
          {item.priority === 'HIGH' && unread ? (
            <AppText variant="caption" weight="600" color="danger">
              · High priority
            </AppText>
          ) : null}
        </Row>
      </View>
      {unread ? <View style={[styles.dot, item.priority === 'HIGH' && { backgroundColor: colors.danger }]} /> : null}
    </Card>
  );
}

export default function AlertsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState('All');
  const unreadOnly = filter === 'Unread';
  const [items, setItems] = useState<AppNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  // A newer request supersedes an older one (filter changed while loading).
  const requestId = useRef(0);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const id = ++requestId.current;
      if (mode === 'refresh') setRefreshing(true);
      try {
        const res = await fetchNotifications({ unread: unreadOnly });
        if (id !== requestId.current) return;
        setItems(res.data);
        setTotal(res.total);
        setPage(1);
        setUnreadCount(res.unread);
        setError('');
      } catch (e) {
        if (id === requestId.current) setError((e as Error).message);
      } finally {
        if (id === requestId.current) {
          setLoaded(true);
          setRefreshing(false);
        }
      }
    },
    [unreadOnly],
  );

  // Refresh whenever the tab is shown or the filter changes, so new notifications are there on return.
  useFocusEffect(
    useCallback(() => {
      load('initial');
    }, [load]),
  );

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await fetchNotifications({ unread: unreadOnly, page: page + 1 });
      // Keep what is already shown; skip anything that arrived twice because new notifications shifted the pages.
      setItems((cur) => [...cur, ...res.data.filter((n) => !cur.some((c) => c._id === n._id))]);
      setTotal(res.total);
      setPage(page + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const open = async (n: AppNotification) => {
    if (!n.readAt) {
      // Show it as read right away; the server catches up in the background.
      setItems((cur) => cur.map((x) => (x._id === n._id ? { ...x, readAt: new Date().toISOString() } : x)));
      markNotificationRead(n._id)
        .then(() => load('initial'))
        .catch(() => load('initial')); // put the list back in step with the server if it failed
    }
    if (n.leadId?._id) router.push({ pathname: '/lead/[id]', params: { id: n.leadId._id } });
    else if (n.customerId?._id) router.push({ pathname: '/customers/[id]', params: { id: n.customerId._id } });
  };

  const readAll = async () => {
    try {
      await markAllNotificationsRead();
    } catch (e) {
      setError((e as Error).message);
    }
    load('initial');
  };

  const unreadShown = items.filter((n) => !n.readAt).length;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header
        title="Alerts"
        subtitle={!loaded ? 'Loading…' : unreadShown ? `${unreadShown} unread` : 'You are all caught up'}
        right={unreadShown ? <IconButton icon="check" onPress={readAll} /> : undefined}
      />
      <View style={styles.controls}>
        <FilterChips items={FILTERS} value={filter} onChange={setFilter} />
      </View>

      {!loaded ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n._id}
          renderItem={({ item }) => <NotificationRow item={item} onPress={() => open(item)} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name={error ? 'alert' : 'bell'} size={32} color={error ? 'danger' : 'textSubtle'} />
              <AppText color={error ? 'danger' : 'textMuted'} align="center">
                {error || (unreadOnly ? 'No unread alerts.' : 'No alerts yet. Follow-ups, meetings and new leads show up here.')}
              </AppText>
              {error ? (
                <AppText color="primary" weight="600" onPress={() => load('initial')}>
                  Try again
                </AppText>
              ) : null}
            </View>
          }
          ListFooterComponent={
            items.length < total ? (
              <View style={{ paddingTop: 4 }}>
                <Button label="Load more" variant="outline" loading={loadingMore} onPress={loadMore} />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  controls: { paddingHorizontal: 20, paddingBottom: 12 },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 10, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rowUnread: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, marginTop: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
});
