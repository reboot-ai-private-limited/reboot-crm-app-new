import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon, IconName } from '@/components/ui/Icon';
import { Avatar, Card, GradientCard, IconBadge, IconButton, Row, SectionHeader } from '@/components/ui/layout';
import { rupees } from '@/lib/customers';
import { countMyLeads, fetchFollowUps, Lead } from '@/lib/leads';
import { DashboardRow, fetchMyMonth } from '@/lib/reporting';
import { fetchMeetings, Meeting, meetingStatusLabel, meetingStatusTone } from '@/lib/meetings';
import { useAuth } from '@/store/auth';
import { ColorName, colors } from '@/theme';

type Counts = { leads: number; proposals: number; deals: number };
type Tone = 'primary' | 'purple' | 'success' | 'warning' | 'danger';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Days left in the current month, today included. */
function daysLeftInMonth() {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return last - now.getDate() + 1;
}

const DAY = 24 * 60 * 60 * 1000;
const startOfToday = () => new Date().setHours(0, 0, 0, 0);
const at = (l: Lead) => new Date(l.nextActionDate as string).getTime();

/** Overdue and today's follow-ups, oldest first. */
function dueNow(leads: Lead[]) {
  const end = startOfToday() + DAY;
  return leads.filter((l) => at(l) < end).sort((a, b) => at(a) - at(b));
}

/** "11:30 AM" for today, "Yesterday" or "12 Sep" for earlier days. */
function whenText(l: Lead) {
  const t = at(l);
  const today = startOfToday();
  if (t >= today) return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (t >= today - DAY) return 'Yesterday';
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function Stat({ label, value, icon, tone, onPress }: { label: string; value: number | string; icon: IconName; tone: Tone; onPress?: () => void }) {
  return (
    <Card style={styles.stat} onPress={onPress}>
      <IconBadge icon={icon} tone={tone} />
      <AppText variant="heading" style={{ marginTop: 6 }}>
        {value}
      </AppText>
      <AppText variant="caption" color="textMuted" numberOfLines={1}>
        {label}
      </AppText>
    </Card>
  );
}

function MeetingHomeRow({ meeting, onPress }: { meeting: Meeting; onPress: () => void }) {
  const [fg, bg] = meetingStatusTone(meeting.status);
  const start = new Date(meeting.startAt);
  const timeStr = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const leadTitle = meeting.lead?.companyName || meeting.lead?.contactName || 'Lead';
  return (
    <Card onPress={onPress}>
      <Row>
        <IconBadge icon="video" tone="warning" />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="section" numberOfLines={1}>
            {meeting.title}
          </AppText>
          <AppText variant="label" color="textMuted" weight="400" numberOfLines={1}>
            {leadTitle} · {timeStr} ({meeting.durationMin}m)
          </AppText>
        </View>
        <View style={[styles.badge, { backgroundColor: colors[bg] }]}>
          <AppText variant="caption" weight="600" color={fg} style={{ textTransform: 'uppercase' }}>
            {meetingStatusLabel(meeting.status)}
          </AppText>
        </View>
      </Row>
    </Card>
  );
}

function FollowUpRow({ lead, overdue, onPress }: { lead: Lead; overdue: boolean; onPress: () => void }) {
  const tone: ColorName = overdue ? 'danger' : 'warning';
  const action = lead.nextActionNote?.trim() || 'Follow-up';
  return (
    <Card onPress={onPress}>
      <Row>
        <IconBadge icon={overdue ? 'clock' : 'phone'} tone={overdue ? 'danger' : 'primary'} />
        <View style={{ flex: 1 }}>
          <AppText variant="section" numberOfLines={1}>
            {lead.companyName || lead.contactName || 'Unnamed lead'}
          </AppText>
          <AppText variant="label" color="textMuted" weight="400" numberOfLines={1}>
            {action} · {whenText(lead)}
          </AppText>
        </View>
        <View style={[styles.badge, { backgroundColor: colors[overdue ? 'dangerSoft' : 'warningSoft'] }]}>
          <AppText variant="caption" weight="600" color={tone}>
            {overdue ? 'Overdue' : 'Due'}
          </AppText>
        </View>
      </Row>
    </Card>
  );
}

// Employee home. Admins start on the Dashboard tab instead.
export default function Home() {
  const { isAdmin, session } = useAuth();
  const router = useRouter();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [followUps, setFollowUps] = useState<Lead[]>([]);
  const [todayMeetings, setTodayMeetings] = useState<Meeting[]>([]);
  const [month, setMonth] = useState<DashboardRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (refresh = false) => {
      if (isAdmin || !session) return;
      if (refresh) setRefreshing(true);
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

      // Each block loads on its own, so one failing API doesn't blank the whole screen.
      const [c, f, m, meets] = await Promise.allSettled([
        Promise.all([countMyLeads(), countMyLeads('PROPOSAL'), countMyLeads('DEAL_CLOSED')]),
        fetchFollowUps(false),
        fetchMyMonth(session.mobile),
        fetchMeetings({ mine: true, from: startOfDay, to: endOfDay }),
      ]);
      if (c.status === 'fulfilled') setCounts({ leads: c.value[0], proposals: c.value[1], deals: c.value[2] });
      if (f.status === 'fulfilled') setFollowUps(f.value);
      if (m.status === 'fulfilled') setMonth(m.value);
      if (meets.status === 'fulfilled') setTodayMeetings(meets.value);
      const failed = [c, f, m, meets].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      setError(failed ? (failed.reason as Error).message : '');
      setLoaded(true);
      setRefreshing(false);
    },
    [isAdmin, session],
  );

  // Refresh whenever Home comes back into view (after working a lead).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (isAdmin) return <Redirect href="/dashboard" />;

  const due = dueNow(followUps);
  const today = startOfToday();
  const pct = month && month.targetRevenue > 0 ? month.achievedAmount / month.targetRevenue : 0;
  const daysLeft = daysLeftInMonth();
  const name = session?.name ?? '';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}>
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
          <IconButton icon="bell" onPress={() => router.push('/alerts')} />
        </Row>

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
                  <AppText color="primary" weight="600" onPress={() => load(true)}>
                    Retry
                  </AppText>
                </Row>
              </Card>
            ) : null}

            {/* Monthly target (set by Admin on web → Team → Add Target). */}
            <GradientCard>
              <AppText variant="label" color="surface" weight="500" style={{ opacity: 0.9 }}>
                Monthly target
              </AppText>
              {month && month.targetRevenue > 0 ? (
                <>
                  <AppText color="surface" style={styles.amount}>
                    {rupees(month.achievedAmount)}
                    <AppText variant="label" color="surface" weight="400">
                      {'  '}of {rupees(month.targetRevenue)}
                    </AppText>
                  </AppText>
                  <View style={styles.trackOnGradient}>
                    <View style={[styles.trackFill, { width: `${Math.max(2, Math.min(100, pct * 100))}%` }]} />
                  </View>
                  <AppText variant="caption" color="surface" style={{ opacity: 0.9 }}>
                    {Math.round(pct * 100)}% achieved · {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                  </AppText>
                </>
              ) : (
                <AppText color="surface">No target set for this month.</AppText>
              )}
            </GradientCard>

            {/* My numbers */}
            <View style={styles.grid}>
              <Stat label="My leads" value={counts?.leads ?? '–'} icon="users" tone="primary" onPress={() => router.push('/leads')} />
              <Stat label="Proposals" value={counts?.proposals ?? '–'} icon="file" tone="purple" onPress={() => router.push('/leads')} />
              <Stat label="Deals" value={counts?.deals ?? '–'} icon="check" tone="success" onPress={() => router.push('/leads')} />
            </View>

            {/* Today's meetings */}
            <SectionHeader title="Today's meetings" link="See all" onPress={() => router.push('/meetings')} />
            {todayMeetings.length === 0 ? (
              <Card>
                <Row>
                  <Icon name="check" size={18} color="success" />
                  <AppText color="textMuted">No meetings scheduled for today.</AppText>
                </Row>
              </Card>
            ) : (
              <>
                {todayMeetings.slice(0, 3).map((m) => (
                  <MeetingHomeRow
                    key={m._id}
                    meeting={m}
                    onPress={() => router.push({ pathname: '/lead/[id]', params: { id: m.leadId } })}
                  />
                ))}
                {todayMeetings.length > 3 ? (
                  <AppText variant="label" color="primary" align="center" onPress={() => router.push('/meetings')}>
                    +{todayMeetings.length - 3} more
                  </AppText>
                ) : null}
              </>
            )}

            {/* Follow-ups due today or overdue */}
            <SectionHeader title="Today's follow-ups" link="See all" onPress={() => router.push('/followups')} />
            {due.length === 0 ? (
              <Card>
                <Row>
                  <Icon name="check" size={18} color="success" />
                  <AppText color="textMuted">Nothing due today.</AppText>
                </Row>
              </Card>
            ) : (
              <>
                {due.slice(0, 4).map((l) => (
                  <FollowUpRow key={l._id} lead={l} overdue={at(l) < today} onPress={() => router.push({ pathname: '/lead/[id]', params: { id: l._id } })} />
                ))}
                {due.length > 4 ? (
                  <AppText variant="label" color="primary" align="center" onPress={() => router.push('/followups')}>
                    +{due.length - 4} more
                  </AppText>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 12, gap: 16 },
  amount: { fontSize: 30, fontWeight: '700', lineHeight: 38 },
  trackOnGradient: { height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 4, backgroundColor: colors.surface },
  grid: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, gap: 2, padding: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
});
