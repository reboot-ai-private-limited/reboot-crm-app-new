import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
//   Admin:    Dashboard · Leads · Team · Action · Profile   (Admin alerts are a card on the Action tab)
export default function TabsLayout() {
  const { isAdmin } = useAuth();
  const insets = useSafeAreaInsets();
  const emp = isAdmin ? hidden : {};
  const adm = isAdmin ? {} : hidden;
  // Unread alerts: the number on the Alerts tab (employees) or on the Action tab (Admin).
  const unread = useUnreadCount(true);
  const unreadBadge = unread > 0 ? (unread > 99 ? '99+' : unread) : undefined;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Screens cross-fade with a slight slide when switching tabs.
        animation: 'shift',
        tabBarButton: (props) => <TabButton {...props} />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        // Grow by the bottom inset so the bar sits above the system navigation bar instead of under it.
        // iPhone: close to the standard tab bar height, so there is no extra empty band above the home indicator.
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopColor: colors.border,
          height: (Platform.OS === 'ios' ? 52 : 64) + insets.bottom,
          paddingTop: Platform.OS === 'ios' ? 4 : 6,
          paddingBottom: insets.bottom,
        },
        // White at the top fading to light blue at the bottom.
        tabBarBackground: () => <LinearGradient colors={[colors.surface, colors.primarySoft]} style={StyleSheet.absoluteFill} />,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tab('home'), ...emp }} />
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: tab('home'), ...adm }} />
      <Tabs.Screen name="leads" options={{ title: 'Leads', tabBarIcon: tab('users') }} />
      <Tabs.Screen name="meetings" options={{ title: 'Meetings', tabBarIcon: tab('calendar'), ...emp }} />
      <Tabs.Screen name="team" options={{ title: 'Team', tabBarIcon: tab('target'), ...adm }} />
      <Tabs.Screen name="actions" options={{ title: 'Action', tabBarIcon: tab('alert'), tabBarBadge: isAdmin ? unreadBadge : undefined, ...adm }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: tab('bell'), tabBarBadge: unreadBadge, ...emp }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tab('user') }} />
    </Tabs>
  );
}
