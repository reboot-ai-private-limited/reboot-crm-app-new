import { Stack } from 'expo-router';

// Tabs, plus the lead screens pushed on top of them.
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 250 }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="lead/[id]" />
      <Stack.Screen name="lead/new" />
      <Stack.Screen name="lead/edit/[id]" />
      <Stack.Screen name="lead/proposals/[id]" />
      <Stack.Screen name="followups" />
      <Stack.Screen name="team/[id]" />
      <Stack.Screen name="team/new" />
      <Stack.Screen name="team/target" />
      <Stack.Screen name="actions/[kind]" />
      <Stack.Screen name="customers/index" />
      <Stack.Screen name="customers/[id]" />
    </Stack>
  );
}
