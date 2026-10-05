import { Tabs } from 'expo-router';

import { IconName } from '@/components/ui/Icon';
import { AnimatedTabIcon, TabButton } from '@/components/ui/TabBarParts';
import { useUnreadCount } from '@/lib/notifications';
import { useAuth } from '@/store/auth';
import { colors } from '@/theme';

function tab(icon: IconName) {
  const TabIcon = ({ focused }: { focused: boolean }) => <AnimatedTabIcon name={icon} focused={focused} />;
  TabIcon.displayName = `TabIcon(${icon})`;
  return TabIcon;
}

// Hidden tabs are removed from the bar. (Expo Router's `href: null` can't be combined with a custom tabBarButton.)
const hidden = { tabBarItemStyle: { display: 'none' as const }, tabBarButton: () => null };

// One app, tabs by role:
//   Employee: Home · Leads · Meetings · Alerts · Profile
//   Admin:    Dashboard · Leads · Team · Action · Profile
export default function TabsLayout() {
  const { isAdmin } = useAuth();
  const emp = isAdmin ? hidden : {};
  const adm = isAdmin ? {} : hidden;
  // Number on the Alerts tab. Employees only (Admin has no Alerts tab).
  const unread = useUnreadCount(!isAdmin);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Screens cross-fade with a slight slide when switching tabs.
        animation: 'shift',
        tabBarButton: (props) => <TabButton {...props} />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tab('home'), ...emp }} />
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: tab('home'), ...adm }} />
      <Tabs.Screen name="leads" options={{ title: 'Leads', tabBarIcon: tab('users') }} />
      <Tabs.Screen name="meetings" options={{ title: 'Meetings', tabBarIcon: tab('calendar'), ...emp }} />
      <Tabs.Screen name="team" options={{ title: 'Team', tabBarIcon: tab('target'), ...adm }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: tab('bell'), tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined, ...emp }} />
      <Tabs.Screen name="actions" options={{ title: 'Action', tabBarIcon: tab('alert'), ...adm }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tab('user') }} />
    </Tabs>
  );
}
