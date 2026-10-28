import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Icon, IconName } from '@/components/ui/Icon';
import { Avatar, Card, Header, Row } from '@/components/ui/layout';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

const ROLE_LABEL = { Admin: 'Admin', BusinessAdvisor: 'Business Advisor', FieldSales: 'Field Sales' } as const;

type Me = { email?: string; createdAt?: string };

function LinkRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Card onPress={onPress}>
      <Row>
        <Icon name={icon} size={20} color="primary" />
        <AppText weight="500" style={{ flex: 1 }}>
          {label}
        </AppText>
        <Icon name="chevR" size={16} color="textSubtle" />
      </Row>
    </Card>
  );
}

// View-only profile (employees can't edit their own details; Admin does it on web → Team) + shortcuts + log out.
// Notification settings come with push notifications.
export default function Profile() {
  const { session, signOut, isAdmin } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  // Email and joining date aren't in the stored session: read them from GET /employees/me.
  useFocusEffect(
    useCallback(() => {
      api<Me>('/employees/me')
        .then(setMe)
        .catch(() => {});
    }, []),
  );

  const joined = me?.createdAt ? new Date(me.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const version = Constants.expoConfig?.version;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header title="Profile" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 20 }}>
          <Avatar name={session?.name ?? ''} size={64} />
          <AppText variant="section">{session?.name}</AppText>
          <AppText variant="label" color="primary">
            {session ? ROLE_LABEL[session.role] : ''}
          </AppText>
        </Card>

        <Card style={{ gap: 12 }}>
          <Row>
            <Icon name="phone" size={18} color="textMuted" />
            <AppText style={{ flex: 1 }}>+91 {session?.mobile}</AppText>
          </Row>
          {me?.email ? (
            <Row>
              <Icon name="mail" size={18} color="textMuted" />
              <AppText style={{ flex: 1 }} numberOfLines={1}>
                {me.email}
              </AppText>
            </Row>
          ) : null}
          {joined ? (
            <Row>
              <Icon name="calendar" size={18} color="textMuted" />
              <AppText style={{ flex: 1 }}>Joined {joined}</AppText>
            </Row>
          ) : null}
        </Card>

        <View style={{ gap: 10 }}>
          <LinkRow icon="briefcase" label={isAdmin ? 'All customers' : 'My customers'} onPress={() => router.push('/customers')} />
          <LinkRow icon="file" label={isAdmin ? 'All proposals' : 'My proposals'} onPress={() => router.push('/proposals')} />
          <LinkRow icon="clock" label="Follow-ups" onPress={() => router.push('/followups')} />
          {isAdmin ? <LinkRow icon="calendar" label="All meetings" onPress={() => router.push('/all-meetings')} /> : null}
        </View>

        {version ? (
          <AppText variant="caption" color="textSubtle" align="center">
            App version {version}
          </AppText>
        ) : null}
        <Button label="Log out" variant="danger" icon="logout" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 4, gap: 14, paddingBottom: 40 },
});
