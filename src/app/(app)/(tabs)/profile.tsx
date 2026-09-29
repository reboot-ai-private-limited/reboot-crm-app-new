import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Avatar, Card, Header, Screen } from '@/components/ui/layout';
import { useAuth } from '@/store/auth';

const ROLE_LABEL = { Admin: 'Admin', BusinessAdvisor: 'Business Advisor', FieldSales: 'Field Sales' } as const;

// Minimal profile: signed-in employee from GET /employees/me + log out. Full screen not built yet.
export default function Profile() {
  const { session, signOut } = useAuth();
  return (
    <Screen>
      <Header title="Profile" />
      <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 20 }}>
        <Avatar name={session?.name ?? ''} size={64} />
        <AppText variant="section">{session?.name}</AppText>
        <AppText color="textMuted">+91 {session?.mobile}</AppText>
        <AppText variant="label" color="primary">
          {session ? ROLE_LABEL[session.role] : ''}
        </AppText>
      </Card>
      <View>
        <Button label="Log out" variant="danger" icon="logout" onPress={signOut} />
      </View>
    </Screen>
  );
}
