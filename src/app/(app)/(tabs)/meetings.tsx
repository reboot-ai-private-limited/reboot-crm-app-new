import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Card, Header, Row, Segmented } from '@/components/ui/layout';
import {
  fetchMeetings,
  hostName,
  isActiveMeeting,
  Meeting,
  meetingStatusLabel,
  meetingStatusTone,
  shouldPoll,
} from '@/lib/meetings';
import { useAuth } from '@/store/auth';
import { colors, radius } from '@/theme';

type TabFilter = 'Today' | 'Upcoming' | 'Past';
const TABS: string[] = ['Today', 'Upcoming', 'Past'];

function formatMeetingSlot(startIso: string, endIso: string, durationMin: number): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateStr = start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const startTimeStr = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const endTimeStr = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${dateStr} · ${startTimeStr} – ${endTimeStr} (${durationMin}m)`;
}

function isMeetingInTab(m: Meeting, tab: TabFilter, nowMs: number, startTodayMs: number, endTodayMs: number): boolean {
  const startTime = new Date(m.startAt).getTime();
  const endTime = new Date(m.endAt).getTime();

  if (tab === 'Today') {
    return (
      m.status === 'IN_PROGRESS' ||
      (startTime >= startTodayMs && startTime <= endTodayMs)
    );
  }
  if (tab === 'Upcoming') {
    return startTime > nowMs && m.status !== 'CANCELLED' && m.status !== 'DONE';
  }
  if (tab === 'Past') {
    return (
      m.status === 'DONE' ||
      m.status === 'NOT_HAPPENED' ||
      m.status === 'CANCELLED' ||
      endTime < nowMs
    );
  }
  return true;
}

export default function MeetingsScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<TabFilter>('Today');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    setNow(Date.now());
    try {
      // Non-admins see their own meetings; Admins see all
      const data = await fetchMeetings({ mine: !isAdmin });
      setMeetings(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load meetings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Poll every 30s while any meeting is in progress or starts within 60 minutes
  useEffect(() => {
    if (!shouldPoll(meetings)) return;
    const interval = setInterval(() => {
      load();
    }, 30_000);
    return () => clearInterval(interval);
  }, [meetings, load]);

  const startOfTodayMs = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [now]);

  const endOfTodayMs = useMemo(() => {
    const d = new Date(now);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, [now]);

  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => isMeetingInTab(m, tab, now, startOfTodayMs, endOfTodayMs));
  }, [meetings, tab, now, startOfTodayMs, endOfTodayMs]);

  const emptyText =
    tab === 'Today'
      ? 'No meetings scheduled for today.'
      : tab === 'Upcoming'
      ? 'No upcoming meetings.'
      : 'No past meetings.';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header title="Meetings" subtitle={isAdmin ? 'All company meetings' : 'My scheduled meetings'} />

      <View style={styles.tabBar}>
        <Segmented items={TABS} value={tab} onChange={(v) => setTab(v as TabFilter)} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {loading && !refreshing ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : error ? (
          <Card style={{ gap: 8, alignItems: 'center', paddingVertical: 20 }}>
            <Icon name="alert" size={24} color="danger" />
            <AppText color="danger" align="center">
              {error}
            </AppText>
            <Button label="Retry" variant="soft" small onPress={() => load()} />
          </Card>
        ) : filteredMeetings.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
            <Icon name="calendar" size={32} color="textSubtle" />
            <AppText color="textMuted" align="center">
              {emptyText}
            </AppText>
          </Card>
        ) : (
          filteredMeetings.map((m) => {
            const active = isActiveMeeting(m.status);
            const [fg, bg] = meetingStatusTone(m.status);
            const host = hostName(m);
            const leadTitle = m.lead?.companyName || m.lead?.contactName || 'Lead';

            return (
              <Card
                key={m._id}
                onPress={() =>
                  router.push({
                    pathname: '/lead/[id]',
                    params: { id: m.leadId },
                  })
                }
                style={styles.meetingCard}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText weight="700" numberOfLines={1}>
                      {m.title}
                    </AppText>
                    <AppText variant="caption" color="textMuted">
                      {formatMeetingSlot(m.startAt, m.endAt, m.durationMin)}
                    </AppText>
                  </View>
                  <View style={[styles.pill, { backgroundColor: colors[bg] }]}>
                    <AppText variant="caption" weight="700" color={fg} style={{ textTransform: 'uppercase', fontSize: 10 }}>
                      {meetingStatusLabel(m.status)}
                    </AppText>
                  </View>
                </View>

                {/* Lead & Host Row */}
                <Row style={{ justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
                  <Row gap={6} style={{ alignItems: 'center', flex: 1 }}>
                    <Icon name="user" size={14} color="textMuted" />
                    <AppText variant="caption" weight="600" color="primary" numberOfLines={1}>
                      {leadTitle}
                    </AppText>
                  </Row>
                  {host ? (
                    <AppText variant="caption" color="textMuted" style={{ fontSize: 11 }}>
                      Host: {host}
                    </AppText>
                  ) : null}
                </Row>

                {/* Meet Link & Join Button */}
                {active && m.meetLink ? (
                  <Row style={{ justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                    <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
                      Google Meet
                    </AppText>
                    <Button
                      label="Join"
                      variant="primary"
                      icon="video"
                      small
                      onPress={() => Linking.openURL(m.meetLink)}
                    />
                  </Row>
                ) : null}
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  tabBar: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  content: {
    padding: 20,
    paddingTop: 4,
    gap: 12,
    paddingBottom: 40,
  },
  center: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetingCard: {
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
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
});
